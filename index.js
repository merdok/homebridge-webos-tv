const lgtv2 = require('lgtv2');
const wol = require('wake_on_lan');
const tcpp = require('tcp-ping');

let Service;
let Characteristic;

let lgtv;
let pointerInputSocket;
var tvVolume = 0;
var tvMuted = false;
var tvCurrentChannel = -1;
var tvCurrentAppId = "";
var launchLiveTvChannel = null;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory('homebridge-webos-tv', 'webostv', webosTvAccessory);
};


// MAIN SETUP
function webosTvAccessory(log, config, api) {
    this.log = log;
    this.port = 3000;

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
    this.alivePollingInterval = config['pollingInterval'] || 5;
    this.alivePollingInterval = this.alivePollingInterval * 1000;
    this.appSwitch = config['appSwitch'];
    this.channelButtons = config['channelButtons'];
    this.notificationButtons = config['notificationButtons'];
    this.remoteControlButtons = config['remoteControlButtons'];

    this.url = 'ws://' + this.ip + ':' + this.port;
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

    if (!this.checkAliveInterval) {
        this.checkAliveInterval = setInterval(this.checkTVState.bind(this, this.updateTvStatus.bind(this)), this.alivePollingInterval);
    }

    this.lgtv.on('connect', () => {
        this.log.info('webOS - connected to TV');
        this.getTvInformation();
        this.connected = true;
        this.updateTvStatus(null, true);
        this.subscribeToServices();
        this.connectToPointerInputSocket();
        this.updateAccessoryStatus();
    });

    this.lgtv.on('close', () => {
        this.log.info('webOS - disconnected from TV');
        this.connected = false;
        this.pointerInputSocket = null;
        this.updateTvStatus(null, false);
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
        .on('get', this.getPowerState.bind(this))
        .on('set', this.setPowerState.bind(this));

    this.informationService
        .setCharacteristic(Characteristic.Manufacturer, 'LG Electronics Inc.')
        .setCharacteristic(Characteristic.Model, 'webOS TV')
        .setCharacteristic(Characteristic.SerialNumber, '-')
        .setCharacteristic(Characteristic.FirmwareRevision, '1.4.0');


    this.enabledServices.push(this.powerService);
    this.enabledServices.push(this.informationService);

    this.prepareVolumeService();
    this.prepareAppSwitchService();
    this.prepareChannelService();
    this.prepareMediaControlService();
    this.prepareChannelButtonService();
    this.prepareNotificationButtonService();
    this.prepareRemoteControlButtonService();
}


// INIT HELPER METHODS
webosTvAccessory.prototype.getTvInformation = function() {

    setTimeout(() => {
        this.log.debug('webOS - requesting TV information');

        this.lgtv.request('ssap://system/getSystemInfo', (err, res) => {
            if (!res || err || res.errorCode) {
                this.log.debug('webOS - system info - error while getting system info');
            } else {
                delete res['returnValue'];
                this.log.debug('webOS - system info:' + '\n' + JSON.stringify(res, null, 2));
            }
        });

        this.lgtv.request('ssap://com.webos.service.update/getCurrentSWInformation', (err, res) => {
            if (!res || err || res.errorCode) {
                this.log.debug('webOS - sw information - error while getting sw information');
            } else {
                delete res['returnValue'];
                this.log.debug('webOS - sw information:' + '\n' + JSON.stringify(res, null, 2));
            }
        });

        this.lgtv.request('ssap://api/getServiceList', (err, res) => {
            if (!res || err || res.errorCode) {
                this.log.debug('webOS - service list - error while getting service list');
            } else {
                delete res['returnValue'];
                this.log.debug('webOS - service list:' + '\n' + JSON.stringify(res, null, 2));
            }
        });
    }, 100);

}

webosTvAccessory.prototype.subscribeToServices = function() {

    this.log.debug('webOS - subscribing to TV services');

    // foreground app info
    this.lgtv.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', (err, res) => {
        if (!res || err) {
            this.log.error('webOS - TV app check - error while getting current app');
        } else {
            if (res.appId) {
                this.tvCurrentAppId = res.appId;
                this.setAppSwitchManually(null, true, this.tvCurrentAppId);
                this.log.info('webOS - app launched, current appId: %s', res.appId);
                if (this.channelButtonService) {
                    if (this.tvCurrentAppId === "com.webos.app.livetv") {
                        // if the launchLiveTvChannel variable is not empty then switch to the specified channel and set the varaible to null
                        if (this.launchLiveTvChannel !== undefined || this.launchLiveTvChannel !== null || this.launchLiveTvChannel.length > 0) {
                            this.openChannel(this.launchLiveTvChannel);
                            this.launchLiveTvChannel = null;
                        }
                        // check which channel is currently active and update the channel switch if exists
                        this.checkCurrentChannel(this.setChannelButtonManually.bind(this));
                    } else {
                        //if not livetv app then disable all other channel buttons
                        this.setChannelButtonManually(null, false, null);
                    }

                }
            }
        }
    });

    // audio status
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

    // current channel
    this.lgtv.subscribe('ssap://tv/getCurrentChannel', (err, res) => {
        if (!res || err) {
            this.log.error('webOS - TV channel status - error while getting current channel status');
        } else {
            if (this.tvCurrentChannel !== res.channelNumber) {
                this.log.info('webOS - current channel status changed');
                // channel changed
                this.tvCurrentChannel = res.channelNumber;
                this.setChannelButtonManually(null, true, res.channelNumber);
                this.log.info('webOS - current channel: %s, %s', res.channelNumber, res.channelName);
            }
        }
    });

};

webosTvAccessory.prototype.connectToPointerInputSocket = function() {

    this.log.debug('webOS - connecting to remote control socket');

    this.lgtv.getSocket('ssap://com.webos.service.networkinput/getPointerInputSocket', (err, sock) => {
        if (!err) {
            this.pointerInputSocket = sock;
        }
    });

};


// SETUP COMPLEX SERVICES
webosTvAccessory.prototype.prepareVolumeService = function() {

    if (!this.volumeControl) {
        return;
    }

    // slider/lightbulb
    if (this.volumeControl == true || this.volumeControl === "slider") {
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
    if (this.volumeControl == true || this.volumeControl === "switch") {
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

    if (Array.isArray(this.appSwitch) == false) {
        this.appSwitch = [this.appSwitch];
    }

    this.appSwitchService = new Array();
    this.appSwitch.forEach((value, i) => {
        this.appSwitch[i] = this.appSwitch[i].replace(/\s/g, ''); // remove all white spaces from the string
        this.appSwitchService[i] = new Service.Switch(this.name + " App: " + value, "appSwitchService" + i);
    });

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

    this.appSwitch.forEach((value, i) => {
        this.enabledServices.push(this.appSwitchService[i]);
    });

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

webosTvAccessory.prototype.prepareChannelButtonService = function() {

    if (this.channelButtons == undefined || this.channelButtons == null || this.channelButtons.length <= 0) {
        return;
    }

    if (Array.isArray(this.channelButtons) == false) {
        this.channelButtons = [this.channelButtons];
    }

    this.channelButtonService = new Array();
    this.channelButtons.forEach((value, i) => {
        this.channelButtons[i] = this.channelButtons[i].toString();
        this.channelButtonService[i] = new Service.Switch(this.name + " Channel: " + value, "channelButtonService" + i);
    });

    this.channelButtons.forEach((value, i) => {
        this.channelButtonService[i]
            .getCharacteristic(Characteristic.On)
            .on('get', (callback) => {
                this.getChannelButtonState(callback, this.channelButtons[i]);
            })
            .on('set', (state, callback) => {
                this.setChannelButtonState(state, callback, this.channelButtons[i]);
            });
    });

    this.channelButtons.forEach((value, i) => {
        this.enabledServices.push(this.channelButtonService[i]);
    });

};

webosTvAccessory.prototype.prepareNotificationButtonService = function() {

    if (this.notificationButtons == undefined || this.notificationButtons == null || this.notificationButtons.length <= 0) {
        return;
    }

    if (Array.isArray(this.notificationButtons) == false) {
        this.notificationButtons = [this.notificationButtons];
    }

    this.notificationButtonService = new Array();
    this.notificationButtons.forEach((value, i) => {
        this.notificationButtons[i] = this.notificationButtons[i].toString();
        this.notificationButtonService[i] = new Service.Switch(this.name + " Notification: " + value, "notificationButtonService" + i);
    });

    this.notificationButtons.forEach((value, i) => {
        this.notificationButtonService[i]
            .getCharacteristic(Characteristic.On)
            .on('get', (callback) => {
                this.getNotificationButtonState(callback, this.notificationButtons[i]);
            })
            .on('set', (state, callback) => {
                this.setNotificationButtonState(state, callback, this.notificationButtons[i]);
            });
    });

    this.notificationButtons.forEach((value, i) => {
        this.enabledServices.push(this.notificationButtonService[i]);
    });

};

webosTvAccessory.prototype.prepareRemoteControlButtonService = function() {

    if (this.remoteControlButtons == undefined || this.remoteControlButtons == null || this.remoteControlButtons.length <= 0) {
        return;
    }

    if (Array.isArray(this.remoteControlButtons) == false) {
        this.remoteControlButtons = [this.remoteControlButtons];
    }

    this.remoteControlButtonService = new Array();
    this.remoteControlButtons.forEach((value, i) => {
        this.remoteControlButtons[i] = this.remoteControlButtons[i].toString().toUpperCase();
        this.remoteControlButtonService[i] = new Service.Switch(this.name + " RC: " + value, "remoteControlButtonService" + i);
    });

    this.remoteControlButtons.forEach((value, i) => {
        this.remoteControlButtonService[i]
            .getCharacteristic(Characteristic.On)
            .on('get', (callback) => {
                this.getRemoteControlButtonState(callback, this.remoteControlButtons[i]);
            })
            .on('set', (state, callback) => {
                this.setRemoteControlButtonState(state, callback, this.remoteControlButtons[i]);
            });
    });

    this.remoteControlButtons.forEach((value, i) => {
        this.enabledServices.push(this.remoteControlButtonService[i]);
    });

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
        if (appId == undefined || appId == null || appId.length <= 0) {
            this.appSwitch.forEach((tmpVal, i) => {
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
    }
};

webosTvAccessory.prototype.setChannelButtonManually = function(error, value, channelNumber) {
    if (this.channelButtonService) {
        if (channelNumber == undefined || channelNumber == null || channelNumber.length <= 0) {
            this.channelButtons.forEach((tmpVal, i) => {
                this.channelButtonService[i].getCharacteristic(Characteristic.On).updateValue(value);
            });
        } else {
            this.channelButtons.forEach((tmpVal, i) => {
                if (channelNumber === tmpVal) {
                    this.channelButtonService[i].getCharacteristic(Characteristic.On).updateValue(value);
                } else {
                    this.channelButtonService[i].getCharacteristic(Characteristic.On).updateValue(false);
                }
            });
        }
    }
};

webosTvAccessory.prototype.disableAllNotificationButtons = function() {
    if (this.notificationButtonService) {
        this.notificationButtons.forEach((tmpVal, i) => {
            this.notificationButtonService[i].getCharacteristic(Characteristic.On).updateValue(false);
        });
    }
};

webosTvAccessory.prototype.disableAllRemoteControlButtons = function() {
    if (this.remoteControlButtonService) {
        this.remoteControlButtons.forEach((tmpVal, i) => {
            this.remoteControlButtonService[i].getCharacteristic(Characteristic.On).updateValue(false);
        });
    }
};

webosTvAccessory.prototype.updateAccessoryStatus = function() {
    if (this.appSwitchService) this.checkForegroundApp(this.setAppSwitchManually.bind(this));
    if (this.channelButtonService) this.checkCurrentChannel(this.setChannelButtonManually.bind(this));
};

webosTvAccessory.prototype.updateTvStatus = function(error, status) {
    if (!status) {
        this.powerService.getCharacteristic(Characteristic.On).updateValue(false);
        if (this.volumeService) this.volumeService.getCharacteristic(Characteristic.On).updateValue(false);
        this.setAppSwitchManually(null, false, null);
        this.setChannelButtonManually(null, false, null);
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
                this.log.debug('webOS - power on callback - connected to tv, running callback');
                setTimeout(callback.bind(this), 1000);
                clearInterval(appLaunchInterval);
                return;
            }
            this.log.debug('webOS - power on callback - trying to connect to tv...');
            this.lgtv.connect(this.url);

            if (x++ === 7) {
                clearInterval(appLaunchInterval);
                return;
            }
        }, 2000);
    });
};

webosTvAccessory.prototype.checkTVState = function(callback) {
    tcpp.probe(this.ip, this.port, (err, isAlive) => {
        if (!isAlive && this.connected) {
            this.connected = false;
            this.lgtv.disconnect();
        } else if (isAlive && !this.connected) {
            this.lgtv.connect(this.url);
            this.connected = true;
        }
        this.log.debug('webOS - TV state: %s', this.connected ? "On" : "Off");
        callback(null, this.connected);
    });
};

webosTvAccessory.prototype.checkForegroundApp = function(callback, appId) {
    if (this.connected) {
        this.lgtv.request('ssap://com.webos.applicationManager/getForegroundAppInfo', (err, res) => {
            if (!res || err || res.errorCode || res.appId === "") {
                this.log.debug('webOS - current app - error while getting current app info');
                callback(null, false, null); // disable all switches
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

webosTvAccessory.prototype.checkCurrentChannel = function(callback, channelNum) {
    if (this.connected) {
        this.lgtv.request('ssap://tv/getCurrentChannel', (err, res) => {
            if (!res || err || res.errorCode) {
                this.log.debug('webOS - current channel - error while getting current channel info');
                callback(null, false, null); // disable all switches
            } else {
                this.log.debug('webOS - TV current channel: %s, %s', res.channelNumber, res.channelName);
                if (channelNum == undefined || channelNum == null) { // if channelNum undefined or null then i am checking which channel is currently running; if set then continue normally
                    callback(null, true, res.channelNumber);
                } else if (res.channelNumber === channelNum) {
                    callback(null, true, channelNum);
                } else {
                    callback(null, false, channelNum);
                }
            }
        });
    } else {
        callback(null, false);
    }
};

webosTvAccessory.prototype.openChannel = function(channelNum) {
    if (this.connected && this.lgtv) {
        this.lgtv.request('ssap://tv/openChannel', {
            channelNumber: channelNum
        }, (err, res) => {
            if (!res || err || res.errorCode || !res.returnValue) {
                this.log.debug('webOS - open channel - error while switching channel');
                if (res && res.errorText) {
                    this.log.debug('webOS - open channel - error message: %s', res.errorText);
                }
            } else {
                this.log.debug('webOS - open channel - channel switched successfully');
            }
        });
    }
};

// HOMEBRIDGE STATE SETTERS/GETTERS
webosTvAccessory.prototype.getPowerState = function(callback) {
    callback(null, this.connected);
};

webosTvAccessory.prototype.setPowerState = function(state, callback) {
    if (state) {
        this.log.debug('webOS - power service - Trying to power on tv, sending magic packet');
        wol.wake(this.mac, (error) => {
            if (error) {
                this.log.info('webOS - wake on lan error');
                return callback(new Error('webOS - wake on lan error'));
            }
        })
        callback();
    } else {
        if (this.connected) {
            this.log.debug('webOS - power service - TV turned off');
            this.lgtv.request('ssap://system/turnOff', (err, res) => {
                this.lgtv.disconnect();
                this.connected = false;
                this.setAppSwitchManually(null, false, null);
                this.setChannelButtonManually(null, false, null);
                this.setMuteStateManually(null, false);
            })
        }
        callback();
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
        this.log.debug('webOS - volume service - TV %s', !state ? "Muted" : "Unmuted");
        this.lgtv.request('ssap://audio/setMute', {
            mute: !state
        });
        callback();
    } else {
        // disable the switch immediately since i am responding with success
        setTimeout(() => {
            this.volumeService.getCharacteristic(Characteristic.On).updateValue(false);
        }, 10);
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
        this.log.debug('webOS - volume service - setting volume to %s, limit: %s', level, this.volumeLimit);
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
        this.log.debug('webOS - volume service - volume %s pressed, current volume: %s, limit: %s', isUp ? "Up" : "Down", this.tvVolume, this.volumeLimit);
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
        callback(new Error('webOS - volume service - is not connected, cannot set volume'));
    }
};

webosTvAccessory.prototype.getChannelSwitch = function(callback) {
    callback(null, false);
};

webosTvAccessory.prototype.setChannelSwitch = function(state, callback, isUp) {
    if (this.connected) {
        this.log.debug('webOS - channel service - channel %s pressed', isUp ? "Up" : "Down");
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
        callback(new Error('webOS - channel service - is not connected, cannot change channel'));
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
            this.log.debug('webOS - app switch service - launching app with id %s', appId);
            this.lgtv.request('ssap://system.launcher/launch', {
                id: appId
            });
            this.setAppSwitchManually(null, true, appId);
            this.setChannelButtonManually(null, false, null);
        } else {
            this.log.debug('webOS - app switch service - returning back to live tv');
            this.lgtv.request('ssap://system.launcher/launch', {
                id: "com.webos.app.livetv"
            });
        }
        callback();
    } else {
        if (state) {
            this.log.info('webOS - app switch service - Trying to launch %s but TV is off, attempting to power on the TV', appId);
            this.powerOnTvWithCallback(() => {
                this.log.debug('webOS - app switch service - tv powered on, launching app with id: %s', appId);
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
        this.log.debug('webOS - media control service - current media %s', action);
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
        callback(new Error('webOS - media control service - is not connected, cannot control media'));
    }
};

webosTvAccessory.prototype.getChannelButtonState = function(callback, channelNum) {
    if (!this.connected) {
        callback(null, false);
    } else {
        setTimeout(this.checkCurrentChannel.bind(this, callback, channelNum), 50);
    }
};

webosTvAccessory.prototype.setChannelButtonState = function(state, callback, channelNum) {
    if (this.connected) {
        if (state) {
            if (this.tvCurrentAppId === "com.webos.app.livetv") { // it is only possible to switch channels when we are in the livetv app
                this.log.debug('webOS - channel button service - switching to channel number %s', channelNum);
                this.openChannel(channelNum);
            } else { // if we are not in the livetv app, then switch to the livetv app and set launchLiveTvChannel, after the app is switched the channel will be switched to the selected
                this.log.debug('webOS - channel button service - trying to switch to channel %s but the livetv app is not running, switching to livetv app', channelNum);
                this.launchLiveTvChannel = channelNum;
                this.lgtv.request('ssap://system.launcher/launch', {
                    id: "com.webos.app.livetv"
                });
            }
            this.setChannelButtonManually(null, true, channelNum); // enable the selected channel switch and disable all other
            this.setAppSwitchManually(null, false, null); // disable all appswitches if active
        } else { // prevent turning off the switch, since this is the current channel we should not turn off the switch
            setTimeout(() => {
                this.setChannelButtonManually(null, true, channelNum);
            }, 10);
        }
        callback();
    } else {
        if (state) {
            this.log.info('webOS - channel button service - Trying to open channel number %s but TV is off, attempting to power on the TV', channelNum);
            this.powerOnTvWithCallback(() => {
                this.log.debug('webOS - channel button service - tv powered on, switching to channel: %s', channelNum);
                this.openChannel(channelNum);
                callback();
            });
        }
    }
};

webosTvAccessory.prototype.getNotificationButtonState = function(callback) {
    callback(null, false);
};

webosTvAccessory.prototype.setNotificationButtonState = function(state, callback, notification) {
    if (this.connected) {
        this.log.debug('webOS - notification button service - displaying notification with message: %s', notification);
        this.lgtv.request('ssap://system.notifications/createToast', {
            message: notification
        });
    }
    setTimeout(() => {
        this.disableAllNotificationButtons();
    }, 10);
    callback(); // always report success, if i return an error here then siri will respond with "Some device are not responding" which is bad for automation or scenes
    //callback(new Error('webOS - is not connected, cannot show notifications'));
};

webosTvAccessory.prototype.getRemoteControlButtonState = function(callback) {
    callback(null, false);
};

webosTvAccessory.prototype.setRemoteControlButtonState = function(state, callback, rcButton) {
    if (this.connected && this.pointerInputSocket) {
        this.log.debug('webOS - remote control button service - emulating remote control %s press', rcButton);
        if (rcButton === 'CLICK') {
            this.pointerInputSocket.send("click");
        } else {
            this.pointerInputSocket.send("button", {
                name: rcButton
            });
        }
    }
    setTimeout(() => {
        this.disableAllRemoteControlButtons();
    }, 10);
    callback(); // always report success, if i return an error here then siri will respond with "Some device are not responding" which is bad for automation or scenes
    //callback(new Error('webOS - is not connected, cannot show notifications'));
};

webosTvAccessory.prototype.getServices = function() {
    return this.enabledServices;
};
