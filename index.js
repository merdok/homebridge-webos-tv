const lgtv2 = require('lgtv2');
const wol = require('wake_on_lan');
const tcpp = require('tcp-ping');

let lgtv, Service, Characteristic;
var tvVolume = 0;
var tvMuted = false;

// note to myself: keep track of the power status in a variable? Could improve power status, especially for oled tvs, set power state true on connect subscribe, set power state to false on close subscribe?

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory('homebridge-webos-tv', 'webostv', webosTvAccessory);
};

// MAIN SETUP
function webosTvAccessory(log, config, api) {
    this.log = log;
    this.ip = config['ip'];
    this.name = config['name'];
    this.mac = config['mac'];
    this.keyFile = config['keyFile'];
    this.volumeControl = config['volumeControl'];
    if (this.volumeControl == undefined) {
        this.volumeControl = true;
    }
    this.volumeLimit = config['volumeLimit'];
    if (this.volumeLimit == undefined || isNaN(this.volumeLimit) || this.volumeLimit < 0) {
        this.volumeLimit = 100;
    }
    this.channelControl = config['channelControl'];
    if (this.channelControl == undefined) {
        this.channelControl = true;
    }
	this.mediaControl = config['mediaControl'];
    if (this.mediaControl == undefined) {
        this.mediaControl = true;
    }
    this.pollingEnabled = config['pollingEnabled'];
    if (this.pollingEnabled == undefined) {
        this.pollingEnabled = false;
    }
    this.alivePollingInterval = config['pollingInterval'] || 5;
    this.alivePollingInterval = this.alivePollingInterval * 1000;
    this.appSwitch = config['appSwitch'];

    this.url = 'ws://' + this.ip + ':3000';
    this.enabledServices = [];
    this.connected = false;
    this.checkCount = 0;
    this.checkAliveInterval = null;

    this.lgtv = new lgtv2({
        url: this.url,
        timeout: 5000,
        reconnect: 3000,
        keyFile: this.keyFile
    });

    this.lgtv.on('connect', () => {
        this.log.info('webOS - connected to TV');
        this.connected = true;
        if (!this.checkAliveInterval && this.pollingEnabled) {
            this.checkAliveInterval = setInterval(this.checkTVState.bind(this, this.pollCallback.bind(this)), this.alivePollingInterval);
        }
	this.log.debug('webOS - subscribing to TV services');
        this.lgtv.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', (err, res) => {
		if (!res || err) {
                	this.log.error('webOS - TV app check - error while getting current app');
           	 } else {
			if (res.appId) {
				this.log.info('webOS - app launched, current appId: %s', res.appId);
			}
		 }
        });
	this.lgtv.subscribe('ssap://audio/getStatus', (err, res) => {
		if (!res || err) {
			this.log.error('webOS - TV audio status - error while getting current audio status');
		} else {
			this.log.info('webOS - audio status changed');
			
			// volume state
			this.tvVolume = res.volume;
                	this.setVolumeManually(null, this.tvVolume);
                	this.log.info('webOS - current volume: %s', res.volume);
				
			// mute state
                	this.tvMuted = res.mute;
			this.setMuteStateManually(null, !this.tvMuted);
			this.log.info('webOS - muted: %s', res.mute ? "Yes" : "No");
        	}
        });
        this.updateAccessoryStatus();
    });

    this.lgtv.on('close', () => {
        this.log.info('webOS - disconnected from TV');
        this.connected = false;
        //if(this.checkAliveInterval) {
        //  clearInterval(this.checkAliveInterval);
        //  this.checkAliveInterval = undefined;
        //}
    });

    this.lgtv.on('error', (error) => {
        this.log.error('webOS - %s', error);
        //this.connected = false;
        //setTimeout(this.lgtv.connect(this.url), 5000);
    });

    this.lgtv.on('prompt', () => {
        this.log.info('webOS - prompt for confirmation');
        this.connected = false;
    });

    this.lgtv.on('connecting', () => {
        this.log.debug('webOS - connecting to TV');
        this.connected = false;
    });

    this.powerService = new Service.Switch(this.name + " Power", "powerService");
    this.informationService = new Service.AccessoryInformation();


    this.powerService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getState.bind(this))
        .on('set', this.setState.bind(this));

    this.informationService
        .setCharacteristic(Characteristic.Manufacturer, 'LG Electronics Inc.')
        .setCharacteristic(Characteristic.Model, 'webOS TV')
        .setCharacteristic(Characteristic.SerialNumber, '-')
        .setCharacteristic(Characteristic.FirmwareRevision, '1.1.0');


    this.enabledServices.push(this.powerService);
    this.enabledServices.push(this.informationService);

    this.prepareVolumeService();
    this.prepareAppSwitchService();
    this.prepareChannelService();
    this.prepareMediaControlService();
}

// SETUP COMPLEX SERVICES

webosTvAccessory.prototype.prepareVolumeService = function() {

    if (!this.volumeControl) {
        return;
    }

    // slider/lightbulb
	if(this.volumeControl == true || this.volumeControl === "slider"){
		this.volumeService = new Service.Lightbulb(this.name + " Volume", "volumeService");

		this.volumeService
			.getCharacteristic(Characteristic.On)
			.on('get', this.getMuteState.bind(this))
			.on('set', this.setMuteState.bind(this));

		this.volumeService
			.addCharacteristic(new Characteristic.Brightness())
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));

		this.enabledServices.push(this.volumeService);
	}

    // up/down switches
	if(this.volumeControl == true || this.volumeControl === "switch"){
	    this.volumeUpService = new Service.Switch(this.name + " Volume Up", "volumeUpService");

		this.volumeUpService
			.getCharacteristic(Characteristic.On)
			.on('get', this.getVolumeSwitch.bind(this))
			.on('set', (state, callback) => {
				this.setVolumeSwitch(state, callback, true);
			});


		this.enabledServices.push(this.volumeUpService);

		this.volumeDownService = new Service.Switch(this.name + " Volume Down", "volumeDownService");

		this.volumeDownService
			.getCharacteristic(Characteristic.On)
			.on('get', this.getVolumeSwitch.bind(this))
			.on('set', (state, callback) => {
				this.setVolumeSwitch(state, callback, false);
			});


		this.enabledServices.push(this.volumeDownService);
	}

};

webosTvAccessory.prototype.prepareAppSwitchService = function() {

    if (this.appSwitch == undefined || this.appSwitch == null || this.appSwitch.length <= 0) {
        return;
    }

    let isArray = Array.isArray(this.appSwitch);

    if (isArray) {
        this.appSwitchService = new Array();
        this.appSwitch.forEach((value, i) => {
            this.appSwitch[i] = this.appSwitch[i].replace(/\s/g, '');
            this.appSwitchService[i] = new Service.Switch(this.name + " App: " + value, "appSwitchService" + i);
        });
    } else {
        this.appSwitchService = new Service.Switch(this.name + " App: " + this.appSwitch, "appSwitchService");
    }

    if (isArray) {
        this.appSwitch.forEach((value, i) => {
            this.appSwitchService[i]
                .getCharacteristic(Characteristic.On)
                .on('get', (callback) => {
                    this.getAppSwitchState(callback, this.appSwitch[i]);
                })
                .on('set', (state, callback) => {
                    this.setAppSwitchState(state, callback, this.appSwitch[i]);
                });
        });
    } else {
        this.appSwitchService
            .getCharacteristic(Characteristic.On)
            .on('get', (callback) => {
                this.getAppSwitchState(callback, this.appSwitch);
            })
            .on('set', (state, callback) => {
                this.setAppSwitchState(state, callback, this.appSwitch);
            });
    }

    if (isArray) {
        this.appSwitch.forEach((value, i) => {
            this.enabledServices.push(this.appSwitchService[i]);
        });
    } else {
        this.enabledServices.push(this.appSwitchService);
    }

};

webosTvAccessory.prototype.prepareChannelService = function() {

    if (!this.channelControl) {
        return;
    }

    this.channelUpService = new Service.Switch(this.name + " Channel Up", "channelUpService");

    this.channelUpService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getChannelSwitch.bind(this))
        .on('set', (state, callback) => {
            this.setChannelSwitch(state, callback, true);
        });


    this.enabledServices.push(this.channelUpService);

    this.channelDownService = new Service.Switch(this.name + " Channel Down", "channelDownService");

    this.channelDownService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getChannelSwitch.bind(this))
        .on('set', (state, callback) => {
            this.setChannelSwitch(state, callback, false);
        });


    this.enabledServices.push(this.channelDownService);

};

webosTvAccessory.prototype.prepareMediaControlService = function() {

    if (!this.mediaControl) {
        return;
    }

    this.mediaPlayService = new Service.Switch(this.name + " Play", "mediaPlayService");

    this.mediaPlayService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getMediaControlSwitch.bind(this))
        .on('set', (state, callback) => {
            this.setMediaControlSwitch(state, callback, "play");
        });

    this.enabledServices.push(this.mediaPlayService);

    this.mediaPauseService = new Service.Switch(this.name + " Pause", "mediaPauseService");

    this.mediaPauseService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getMediaControlSwitch.bind(this))
        .on('set', (state, callback) => {
            this.setMediaControlSwitch(state, callback, "pause");
        });

    this.enabledServices.push(this.mediaPauseService);
	
	this.mediaStopService = new Service.Switch(this.name + " Stop", "mediaStopService");

    this.mediaStopService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getMediaControlSwitch.bind(this))
        .on('set', (state, callback) => {
            this.setMediaControlSwitch(state, callback, "stop");
        });

    this.enabledServices.push(this.mediaStopService);
	
	this.mediaRewindService = new Service.Switch(this.name + " Rewind", "mediaRewindService");

    this.mediaRewindService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getMediaControlSwitch.bind(this))
        .on('set', (state, callback) => {
            this.setMediaControlSwitch(state, callback, "rewind");
        });

    this.enabledServices.push(this.mediaRewindService);
	
	this.mediaFastForwardService = new Service.Switch(this.name + " Fast Forward", "mediaFastForwardService");

    this.mediaFastForwardService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getMediaControlSwitch.bind(this))
        .on('set', (state, callback) => {
            this.setMediaControlSwitch(state, callback, "fastForward");
        });

    this.enabledServices.push(this.mediaFastForwardService);

};

// HELPER METHODS
webosTvAccessory.prototype.setMuteStateManually = function(error, value) {
    if (this.volumeService) this.volumeService.getCharacteristic(Characteristic.On).updateValue(value);
};

webosTvAccessory.prototype.setVolumeManually = function(error, value) {
    if (this.volumeService) this.volumeService.getCharacteristic(Characteristic.Brightness).updateValue(value);
};

webosTvAccessory.prototype.setAppSwitchManually = function(error, value, appId) {
    if (this.appSwitchService) {
        if (Array.isArray(this.appSwitch)) {
            if (appId == undefined || appId == null || appId.length <= 0) {
                this.appSwitch.forEach((value, i) => {
                    this.appSwitchService[i].getCharacteristic(Characteristic.On).updateValue(value);
                });
            } else {
                this.appSwitch.forEach((tmpVal, i) => {
                    if (appId === tmpVal) {
                        this.appSwitchService[i].getCharacteristic(Characteristic.On).updateValue(value);
                    } else {
                        this.appSwitchService[i].getCharacteristic(Characteristic.On).updateValue(false);
                    }
                });
            }
        } else {
            this.appSwitchService.getCharacteristic(Characteristic.On).updateValue(value);
        }
    }
};

webosTvAccessory.prototype.updateAccessoryStatus = function() {
    if (this.appSwitchService) this.checkForegroundApp(this.setAppSwitchManually.bind(this));
};

webosTvAccessory.prototype.pollCallback = function(error, status) {
    if (!status) {
        this.powerService.getCharacteristic(Characteristic.On).updateValue(status);
        if (this.volumeService) this.volumeService.getCharacteristic(Characteristic.On).updateValue(status);
    } else {
        this.powerService.getCharacteristic(Characteristic.On).updateValue(status);
    }
};

webosTvAccessory.prototype.powerOnTvWithCallback = function(callback) {
    wol.wake(this.mac, (error) => {
        if (error) {
            this.log.info('webOS - wake on lan error');
            return;
        }
        let x = 0;
        let appLaunchInterval = setInterval(() => {
            if (this.connected) {
                setTimeout(callback.bind(this), 1000);
                clearInterval(appLaunchInterval);
                return;
            }

            this.lgtv.connect(this.url);

            if (x++ === 7) {
                clearInterval(appLaunchInterval);
                return;
            }
        }, 2000);
    });
};

webosTvAccessory.prototype.checkTVState = function(callback) {
    tcpp.probe(this.ip, 3000, (err, isAlive) => {
        if (!isAlive) {
            this.connected = false;
        } else {
            this.connected = true;
        }
        this.log.debug('webOS - TV state: %s', this.connected ? "On" : "Off");
        callback(null, this.connected);
    });
};

webosTvAccessory.prototype.checkForegroundApp = function(callback, appId) {
    if (this.connected) {
        this.lgtv.request('ssap://com.webos.applicationManager/getForegroundAppInfo', (err, res) => {
            if (!res || err) {
                callback(new Error('webOS - current app - error while getting current app info'));
            } else {
                this.log.debug('webOS - TV current appId: %s', res.appId);
                if (appId == undefined || appId == null) { // if appId undefined or null then i am checking which app is currently running; if set then continue normally
                    callback(null, true, res.appId);
                } else if (res.appId === appId) {
                    callback(null, true, appId);
                } else {
                    callback(null, false, appId);
                }
            }
        });
    } else {
        callback(null, false);
    }
};

webosTvAccessory.prototype.checkWakeOnLan = function(callback) {
    if (this.connected) {
        this.checkCount = 0;
	this.lgtv.connect(this.url);
        callback(null, true);
    } else {
        if (this.checkCount < 3) {
            this.checkCount++;
            this.lgtv.connect(this.url);
            setTimeout(this.checkWakeOnLan.bind(this, callback), 5000);
        } else {
            this.checkCount = 0;
            callback(new Error('webOS - wake timeout'));
        }
    }
};

// HOMEBRIDGE STATE SETTERS/GETTERS
webosTvAccessory.prototype.getState = function(callback) {
    this.lgtv.connect(this.url);
    this.checkTVState.call(this, callback);
};

webosTvAccessory.prototype.setState = function(state, callback) {
    if (state) {
        if (!this.connected) {
            wol.wake(this.mac, (error) => {
                if (error) return callback(new Error('webOS - wake on lan error'));
                this.checkCount = 0;
                setTimeout(this.checkWakeOnLan.bind(this, callback), 5000);
            })
        } else {
            callback();
        }
    } else {
        if (this.connected) {
            this.lgtv.request('ssap://system/turnOff', (err, res) => {
                if (err) return callback(new Error('webOS - error turning off the TV'));
                this.lgtv.disconnect();
                this.connected = false;
                this.setAppSwitchManually(null, false, null);
		this.setMuteStateManually(null, false);
                callback();
            })
        } else {
            callback();
        }
    }
};


webosTvAccessory.prototype.getMuteState = function(callback) {
	if (this.connected) {
		callback(null, !this.tvMuted);
	} else {
		callback(null, false);
	}
};

webosTvAccessory.prototype.setMuteState = function(state, callback) {
    if (this.connected) {
        this.lgtv.request('ssap://audio/setMute', {
            mute: !state
        });
        callback();
    } else {
        callback(); // respond with success when tv is off
        // callback(new Error('webOS - is not connected, cannot set mute state'));
    }
};


webosTvAccessory.prototype.getVolume = function(callback) {
	if (this.connected) {
	callback(null, this.tvVolume);
	} else {
		callback(null, 0);
	}
};

webosTvAccessory.prototype.setVolume = function(level, callback) {
    if (this.connected) {
        if (level > this.volumeLimit) {
            level = this.volumeLimit;
        }
        this.lgtv.request('ssap://audio/setVolume', {
            volume: level
        });
        callback();
    } else {
        callback(new Error('webOS - is not connected, cannot set volume'));
    }
};

webosTvAccessory.prototype.getVolumeSwitch = function(callback) {
    callback(null, false);
};

webosTvAccessory.prototype.setVolumeSwitch = function(state, callback, isUp) {
    if (this.connected) {
        let volLevel = this.tvVolume;
        if (isUp) {
            if (volLevel < this.volumeLimit) {
                this.lgtv.request('ssap://audio/volumeUp');
            }
        } else {
            this.lgtv.request('ssap://audio/volumeDown');
        }
        setTimeout(() => {
            this.volumeUpService.getCharacteristic(Characteristic.On).updateValue(false);
            this.volumeDownService.getCharacteristic(Characteristic.On).updateValue(false);
        }, 10);
        callback();
    } else {
        callback(new Error('webOS - is not connected, cannot set volume'));
    }
};

webosTvAccessory.prototype.getChannelSwitch = function(callback) {
    callback(null, false);
};

webosTvAccessory.prototype.setChannelSwitch = function(state, callback, isUp) {
    if (this.connected) {
        if (isUp) {
            this.lgtv.request('ssap://tv/channelUp');
        } else {
            this.lgtv.request('ssap://tv/channelDown');
        }
        setTimeout(() => {
            this.channelUpService.getCharacteristic(Characteristic.On).updateValue(false);
            this.channelDownService.getCharacteristic(Characteristic.On).updateValue(false);
        }, 10);
        callback();
    } else {
        callback(new Error('webOS - is not connected, cannot change channel'));
    }
};

webosTvAccessory.prototype.getAppSwitchState = function(callback, appId) {
    if (!this.connected) {
        callback(null, false);
    } else {
        setTimeout(this.checkForegroundApp.bind(this, callback, appId), 50);
    }
};

webosTvAccessory.prototype.setAppSwitchState = function(state, callback, appId) {
    if (this.connected) {
        if (state) {
            this.lgtv.request('ssap://system.launcher/launch', {
                id: appId
            });
            this.setAppSwitchManually(null, true, appId);
        } else {
            this.lgtv.request('ssap://system.launcher/launch', {
                id: "com.webos.app.livetv"
            });
        }
        callback();
    } else {

        if (state) {
            this.log.info('webOS - Trying to launch %s but TV is off, attempting to power on the TV', appId);
            this.powerOnTvWithCallback(() => {
                this.lgtv.request('ssap://system.launcher/launch', {
                    id: appId
                });
                callback();
            });
        }
    }
};

webosTvAccessory.prototype.getMediaControlSwitch = function(callback) {
    callback(null, false);
};

webosTvAccessory.prototype.setMediaControlSwitch = function(state, callback, action) {
    if (this.connected) {
        if (action === "play") {
            this.lgtv.request('ssap://media.controls/play');
        } else if (action === "pause") {
            this.lgtv.request('ssap://media.controls/pause');
        } else if (action === "stop") {
            this.lgtv.request('ssap://media.controls/stop');
        } else if (action === "rewind") {
            this.lgtv.request('ssap://media.controls/rewind');
        } else if (action === "fastForward") {
            this.lgtv.request('ssap://media.controls/fastForward');
        }
        setTimeout(() => {
            this.mediaPlayService.getCharacteristic(Characteristic.On).updateValue(false);
            this.mediaPauseService.getCharacteristic(Characteristic.On).updateValue(false);
			this.mediaStopService.getCharacteristic(Characteristic.On).updateValue(false);
			this.mediaRewindService.getCharacteristic(Characteristic.On).updateValue(false);
			this.mediaFastForwardService.getCharacteristic(Characteristic.On).updateValue(false);
        }, 10);
        callback();
    } else {
        callback(new Error('webOS - is not connected, cannot control media'));
    }
};

webosTvAccessory.prototype.getServices = function() {
    return this.enabledServices;
};

