const lgtv2 = require('lgtv2');
const wol = require('wake_on_lan');
const tcpp = require('tcp-ping');

let lgtv, Service, Characteristic;

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
        this.lgtv.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', (err, res) => {
            if (res && res.appId) {
                this.log.info('webOS - current appId: %s', res.appId);
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
        .setCharacteristic(Characteristic.FirmwareRevision, '1.0.1');


    this.enabledServices.push(this.powerService);
    this.enabledServices.push(this.informationService);

    this.prepareVolumeService();
    this.prepareAppSwitchService();
    this.prepareChannelService();

}

// SETUP COMPLEX SERVICES

webosTvAccessory.prototype.prepareVolumeService = function() {

    if (!this.volumeControl) {
        return;
    }

    // slider/lightbulb
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

    // up/down switches
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

};

webosTvAccessory.prototype.prepareAppSwitchService = function() {

    if (this.appSwitch == undefined || this.appSwitch == null || this.appSwitch.length <= 0) {
        return;
    }

    let isArray = Array.isArray(this.appSwitch);

    if (isArray) {
        this.appSwitchService = new Array();
        this.appSwitch.forEach((value, i) => {
            this.appSwitch[i] = str = this.appSwitch[i].replace(/\s/g, '');
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

// HELPER METHODS
webosTvAccessory.prototype.setMuteStateManually = function(error, value) {
    if (this.volumeService) this.volumeService.getCharacteristic(Characteristic.On).updateValue(value);
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
    if (this.volumeService) this.checkMuteState(this.setMuteStateManually.bind(this));
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

webosTvAccessory.prototype.checkMuteState = function(callback) {
    if (this.connected) {
        this.lgtv.request('ssap://audio/getStatus', (err, res) => {
            if (!res || err) {
                callback(new Error('webOS - TV mute check - error while getting current mute state'));
            } else {
                this.log.info('webOS - TV muted: %s', res.mute ? "Yes" : "No");
                callback(null, !res.mute);
            }
        });
    } else {
        callback(null, false);
    }
};

webosTvAccessory.prototype.checkVolumeLevel = function(callback) {
    if (this.connected) {
        this.lgtv.request('ssap://audio/getVolume', (err, res) => {
            if (!res || err) {
                callback(new Error('webOS - TV volume - error while getting current volume'));
            } else {
                this.log.info('webOS - TV volume: ' + res.volume);
                callback(null, parseInt(res.volume));
            }
        });
    } else {
        callback(null, false);
    }
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
                if (err) return callback(null, false);
                this.lgtv.disconnect();
                this.connected = false;
                this.setMuteStateManually(null, false);
                this.setAppSwitchManually(null, false, null);
                callback();
            })
        } else {
            // TV is off, we want to turn it off, that's success.
            callback();
        }
    }
};


webosTvAccessory.prototype.getMuteState = function(callback) {
    setTimeout(this.checkMuteState.bind(this, callback), 50);
};

webosTvAccessory.prototype.setMuteState = function(state, callback) {
    if (this.connected) {
        this.lgtv.request('ssap://audio/setMute', {
            mute: !state
        });
        callback();
    } else if (!state) {
        // TV is off, call it muted.
        callback();
    } else {
        // Don't want to turn on the TV and unmute if TV is off.
        callback(new Error('webOS - is not connected'))
    }
};


webosTvAccessory.prototype.getVolume = function(callback) {
    setTimeout(this.checkVolumeLevel.bind(this, callback), 50);
};

webosTvAccessory.prototype.setVolume = function(level, callback) {
    if (this.connected) {
        if (level > this.volumeLimit) {
            level = this.volumeLimit;
        }
        this.lgtv.request('ssap://audio/setVolume', {
            volume: level
        });
        callback(null, level);
    } else {
        callback(new Error('webOS - is not connected'))
    }
};

webosTvAccessory.prototype.getVolumeSwitch = function(callback) {
    callback(null, false);
};

webosTvAccessory.prototype.setVolumeSwitch = function(state, callback, isUp) {
    if (this.connected) {
        let volLevel = this.volumeService.getCharacteristic(Characteristic.Brightness).value;
        if (isUp) {
            if (volLevel < this.volumeLimit) {
                this.lgtv.request('ssap://audio/volumeUp');
                volLevel++;
            }
        } else {
            this.lgtv.request('ssap://audio/volumeDown');
            volLevel--;
        }
        setTimeout(() => {
            this.volumeUpService.getCharacteristic(Characteristic.On).updateValue(false);
            this.volumeDownService.getCharacteristic(Characteristic.On).updateValue(false);
            this.setMuteStateManually(null, true);
            this.volumeService.getCharacteristic(Characteristic.Brightness).updateValue(volLevel);
        }, 10);
        callback();
    } else {
        callback(new Error('webOS - is not connected'))
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
        callback(new Error('webOS - is not connected'))
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
        callback(null, state);
    } else {

        if (state) {
            this.log.info('webOS - Trying to launch %s but TV is off, attempting to power on the TV', appId);
            this.powerOnTvWithCallback(() => {
                this.lgtv.request('ssap://system.launcher/launch', {
                    id: appId
                });
                callback(null, true);
            });
        }

        //  callback(new Error('webOS - is not connected'))
    }
};

webosTvAccessory.prototype.getServices = function() {
    return this.enabledServices;
};
