const Lgtv2 = require('lgtv2');
const wol = require('wake_on_lan');
const tcpp = require('tcp-ping');
const fs = require('fs');
const path = require('path');
const ppath = require('persist-path');
const mkdirp = require('mkdirp');

let Service, Characteristic, Homebridge, Accessory;
let lgtv, pointerInputSocket;

const PLUGIN_NAME = 'homebridge-webos-tv';
const PLATFORM_NAME = 'webostv';
const PLUGIN_VERSION = '1.7.1';
const TV_WEBSOCKET_PORT = 3000;

module.exports = (homebridge) => {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Homebridge = homebridge;
    Accessory = homebridge.platformAccessory;
    homebridge.registerAccessory(PLUGIN_NAME, PLATFORM_NAME, webosTvAccessory);
    homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, webosTvPlatform, true);
};


class webosTvAccessory {
    constructor(log, config, api) {
        this.log = log;
        this.api = api;

        // check if we have mandatory device info
        if (!config.ip) throw new Error(`tv ip address is required for ${config.name}`);
        if (!config.mac) throw new Error(`tv mac address is required for ${config.name}`);

        // configuration
        this.name = config.name || 'webOS TV';
        this.ip = config.ip;
        this.mac = config.mac;
        this.broadcastAdr = config.broadcastAdr || '255.255.255.255';
        this.keyFile = config.keyFile || path.join(api.user.storagePath(), 'lgtvKeyFile');
        this.prefsDir = config.prefsDir || ppath('webosTv/');
        this.isLegacyTvService = config.legacyTvService;
        if (this.isLegacyTvService === undefined) {
            this.isLegacyTvService = false;
        }
        this.showInputButtons = config.showInputButtons;
        if (this.showInputButtons === undefined) {
            this.showInputButtons = false;
        }
        this.volumeControl = config.volumeControl;
        if (this.volumeControl === undefined) {
            this.volumeControl = true;
        }
        this.volumeLimit = config.volumeLimit;
        if (this.volumeLimit === undefined || isNaN(this.volumeLimit) || this.volumeLimit < 0) {
            this.volumeLimit = 100;
        }
        this.channelControl = config.channelControl;
        if (this.channelControl === undefined) {
            this.channelControl = true;
        }
        this.mediaControl = config.mediaControl;
        if (this.mediaControl === undefined) {
            this.mediaControl = false;
        }
        this.alivePollingInterval = config.pollingInterval || 5;
        this.alivePollingInterval = this.alivePollingInterval * 1000;
        this.channelButtons = config.channelButtons;
        this.notificationButtons = config.notificationButtons;
        this.remoteControlButtons = config.remoteControlButtons;
        this.inputs = config.inputs;
        this.soundOutputButtons = config.soundOutputButtons;
        this.remoteSequenceButtons = config.remoteSequenceButtons;
        this.infoButtonAction = config.infoButtonAction;
        if (this.infoButtonAction === undefined || this.infoButtonAction.length === 0) {
            this.infoButtonAction = 'INFO';
        }

        // prepare variables
        this.url = 'ws://' + this.ip + ':' + TV_WEBSOCKET_PORT;
        this.enabledServices = [];
        this.connected = false;
        this.checkCount = 0;
        this.checkAliveInterval = null;
        this.tvVolume = 0;
        this.tvMuted = false;
        this.tvCurrentChannel = -1;
        this.tvCurrentAppId = '';
        this.launchLiveTvChannel = null;
        this.isPaused = false;
        this.tvCurrentSoundOutput = '';
        this.inputParams = {};


        // check if prefs directory ends with a /, if not then add it
        if (this.prefsDir.endsWith('/') === false) {
            this.prefsDir = this.prefsDir + '/';
        }

        // check if the tv preferences directory exists, if not then create it
        if (fs.existsSync(this.prefsDir) === false) {
            mkdirp(this.prefsDir);
        }

        // prepare file paths
        this.inputNamesFile = this.prefsDir + 'inputs_' + this.mac.split(':').join('');
        this.tvInfoFile = this.prefsDir + 'info_' + this.mac.split(':').join('');

        // create the lgtv instance
        this.lgtv = new Lgtv2({
            url: this.url,
            timeout: 5000,
            reconnect: 3000,
            keyFile: this.keyFile
        });

        // start the polling
        if (!this.checkAliveInterval) {
            this.checkAliveInterval = setInterval(this.checkTVState.bind(this, this.updateTvStatus.bind(this)), this.alivePollingInterval);
        }

        //register to listeners
        this.lgtv.on('connect', () => {
            this.log.debug('webOS - connected to TV, checking power status');
            this.lgtv.request('ssap://com.webos.service.tvpower/power/getPowerState', (err, res) => {
                if (err || (res && res.state && res.state === 'Active Standby')) {
                    this.log.debug('webOS - power status - TV is Off or Pixel Refresher is running, disconnecting');
                    this.connected = false;
                    this.lgtv.disconnect();
                } else {
                    this.log.debug('webOS - power status - TV is On');
                    this.connected = true;
                    this.connect();
                }
            });
        });

        this.lgtv.on('close', () => {
            this.log.debug('webOS - disconnected from TV');
            this.connected = false;
            this.pointerInputSocket = null;
            this.updateTvStatus(null, false);
        });

        this.lgtv.on('error', (error) => {
            this.log.error('webOS - %s', error);
        });

        this.lgtv.on('prompt', () => {
            this.log.info('webOS - prompt for confirmation');
            this.connected = false;
        });

        this.lgtv.on('connecting', () => {
            this.log.debug('webOS - connecting to TV');
            this.connected = false;
        });

        // preapre the services
        this.prepareInformationService();

        // choose between new (tv integration) or old (legacy) services, in legacy mode the TV will appear as a Switch
        if (this.isLegacyTvService) {
            this.prepareLegacyService();
        } else {
            this.prepareTvService();
        }
    }


    // --== CONNECT/DISCONNECT METHODS ==--	
    connect() {
        this.log.info('webOS - connected to TV');
        this.getTvInformation();
        this.connected = true;
        this.updateTvStatus(null, true);
        this.subscribeToServices();
        this.connectToPointerInputSocket();
        this.updateAccessoryStatus();
    }

    disconnect() {
        this.log.info('webOS - disconnected from TV');
        this.lgtv.disconnect();
        this.connected = false;
        this.updateTvStatus(null, false);
    }

    connectToPointerInputSocket() {
        this.log.debug('webOS - connecting to remote control socket');
        this.lgtv.getSocket('ssap://com.webos.service.networkinput/getPointerInputSocket', (err, sock) => {
            if (!err) {
                this.pointerInputSocket = sock;
            }
        });
    }


    // --== INIT HELPER METHODS ==--
    getTvInformation() {
        setTimeout(() => {
            this.log.debug('webOS - requesting TV information');

            this.lgtv.request('ssap://system/getSystemInfo', (err, res) => {
                if (!res || err || res.errorCode) {
                    this.log.debug('webOS - system info - error while getting system info');
                } else {
                    delete res['returnValue'];
                    this.log.debug('webOS - system info: \n' + JSON.stringify(res, null, 2));
                    // save the tv info to a file if does not exists
                    if (fs.existsSync(this.tvInfoFile) === false) {
                        fs.writeFile(this.tvInfoFile, JSON.stringify(res), (err) => {
                            if (err) {
                                this.log.debug('webOS - error occured could not write tv info %s', err);
                            } else {
                                this.log.debug('webOS - tv info successfully saved!');
                            }
                        });
                    } else {
                        this.log.debug('webOS - tv info file already exists, not saving!');
                    }
                }
            });

            this.lgtv.request('ssap://com.webos.service.update/getCurrentSWInformation', (err, res) => {
                if (!res || err || res.errorCode) {
                    this.log.debug('webOS - sw information - error while getting sw information');
                } else {
                    delete res['returnValue'];
                    this.log.debug('webOS - sw information: \n' + JSON.stringify(res, null, 2));
                }
            });

            this.lgtv.request('ssap://api/getServiceList', (err, res) => {
                if (!res || err || res.errorCode) {
                    this.log.debug('webOS - service list - error while getting service list');
                } else {
                    delete res['returnValue'];
                    this.log.debug('webOS - service list: \n' + JSON.stringify(res, null, 2));
                }
            });
        }, 100);
    }

    subscribeToServices() {
        this.log.debug('webOS - subscribing to TV services');

        // power status
        this.lgtv.subscribe('ssap://com.webos.service.tvpower/power/getPowerState', (err, res) => {
            if (!res || err) {
                this.log.error('webOS - TV power status - error while getting power status');
            } else {
                let statusState = (res && res.state ? res.state : null);
                let statusProcessing = (res && res.processing ? res.processing : null);
                let statusPowerOnReason = (res && res.powerOnReason ? res.powerOnReason : null);
                let powerState = '';

                if (statusState) {
                    powerState = powerState + ' state: ' + statusState + ',';
                }

                if (statusProcessing) {
                    powerState = powerState + ' processing: ' + statusProcessing + ',';
                }

                if (statusPowerOnReason) {
                    powerState = powerState + ' power on reason: ' + statusPowerOnReason + ',';
                }

                this.log.debug('webOS - TV power status changed, status: %s', powerState);

                // if pixel refresher is running then disconnect from TV
                if (statusState === 'Active Standby') {
                    this.disconnect();
                }
            }
        });

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
                        if (this.tvCurrentAppId === 'com.webos.app.livetv') {
                            // if the launchLiveTvChannel variable is not empty then switch to the specified channel and set the varaible to null
                            if (this.launchLiveTvChannel !== undefined && this.launchLiveTvChannel !== null && this.launchLiveTvChannel.length > 0) {
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

                    if (this.tvService && this.inputAppIds && this.inputAppIds.length > 0) {
                        let inputIdentifier = this.inputAppIds.indexOf(res.appId);
                        if (inputIdentifier === -1) {
                            inputIdentifier = 9999999; // select with id that does not exists
                            this.log.debug('webOS - input not found in the input list, not selecting any input');
                        }
                        this.tvService.getCharacteristic(Characteristic.ActiveIdentifier).updateValue(inputIdentifier);
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

                // check if volumeUp or volumeDown was pressed, holds volumeUp or volumeDown if one of those was pressed or is not present if not
                let statusCause = (res && res.cause ? res.cause : null);

                // volume state
                this.tvVolume = res.volume;
                this.setVolumeManually(this.tvVolume, statusCause);
                this.log.info('webOS - current volume: %s', res.volume);

                // mute state
                this.tvMuted = res.mute;
                this.setMuteStateManually(!this.tvMuted);
                this.log.info('webOS - muted: %s', res.mute ? 'Yes' : 'No');
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

        // sound output
        this.lgtv.subscribe('ssap://com.webos.service.apiadapter/audio/getSoundOutput', (err, res) => {
            if (!res || err) {
                this.log.error('webOS - TV sound output - error while getting current sound output status');
            } else {
                if (this.tvCurrentSoundOutput !== res.soundOutput) {
                    this.log.info('webOS - sound output changed');
                    // sound output changed
                    this.tvCurrentSoundOutput = res.soundOutput;
                    this.setSoundOutputManually(null, true, res.soundOutput);
                    this.log.info('webOS - current sound output: %s', res.soundOutput);
                }
            }
        });
    }


    // --== SETUP SERVICES  ==--
    prepareInformationService() {
        // currently i save the tv info in a file and load if it exists
        let modelName = this.name;
        try {
            let infoArr = JSON.parse(fs.readFileSync(this.tvInfoFile));
            modelName = infoArr.modelName;
        } catch (err) {
            this.log.debug('webOS - input names file does not exist');
        }

        // there is currently no way to update the AccessoryInformation service after it was added to the service list
        // when this is fixed in homebridge, update the informationService with the TV info?
        this.informationService = new Service.AccessoryInformation();
        this.informationService
            .setCharacteristic(Characteristic.Manufacturer, 'LG Electronics Inc.')
            .setCharacteristic(Characteristic.Model, modelName)
            .setCharacteristic(Characteristic.SerialNumber, this.mac)
            .setCharacteristic(Characteristic.FirmwareRevision, PLUGIN_VERSION);

        this.enabledServices.push(this.informationService);
    }

    // tv integration services ----------------------------------------------------------------
    prepareTvService() {
        this.tvService = new Service.Television(this.name, 'tvService');
        this.tvService
            .setCharacteristic(Characteristic.ConfiguredName, this.name);
        this.tvService
            .setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
        this.tvService
            .getCharacteristic(Characteristic.Active)
            .on('get', this.getPowerState.bind(this))
            .on('set', this.setPowerState.bind(this));
        //    this.tvService
        //        .setCharacteristic(Characteristic.ActiveIdentifier, 0); // do not preselect any input since there are no default inputs
        this.tvService
            .getCharacteristic(Characteristic.ActiveIdentifier)
            .on('set', (inputIdentifier, callback) => {
                this.log.debug('webOS - input source changed, new input source identifier: %d, source appId: %s', inputIdentifier, this.inputAppIds[inputIdentifier]);
                this.setAppSwitchState(true, callback, this.inputAppIds[inputIdentifier]);
            });
        this.tvService
            .getCharacteristic(Characteristic.RemoteKey)
            .on('set', this.remoteKeyPress.bind(this));
        this.tvService
            .getCharacteristic(Characteristic.PowerModeSelection)
            .on('set', (newValue, callback) => {
                this.log.debug('webOS - requested tv settings (PowerModeSelection): ' + newValue);
                this.setRemoteControlButtonState(true, callback, 'MENU');
            });


        // not supported in the ios beta yet?
        /* 
        this.tvService
          .getCharacteristic(Characteristic.PictureMode)
          .on('set', function(newValue, callback) {
        	console.log('set PictureMode => setNewValue: ' + newValue);
        	callback(null);
          });
          */


        this.enabledServices.push(this.tvService);


        this.prepareTvSpeakerService();
        this.prepareInputSourcesService();

        // additional services
        this.prepareVolumeService();
        this.prepareChannelService();
        this.prepareMediaControlService();
        this.prepareChannelButtonService();
        this.prepareNotificationButtonService();
        this.prepareRemoteControlButtonService();
        this.prepareSoundOutputButtonService();
        this.prepareRemoteSequenceButtonsService();

        // add additional input buttons 
        if (this.showInputButtons === true) {
            this.prepareInputButtonService();
        }
    }

    prepareTvSpeakerService() {
        this.tvSpeakerService = new Service.TelevisionSpeaker(this.name + ' Volume', 'tvSpeakerService');
        this.tvSpeakerService
            .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
            .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
        this.tvSpeakerService
            .getCharacteristic(Characteristic.VolumeSelector)
            .on('set', (state, callback) => {
                this.log.debug('webOS - volume change over the remote control (VolumeSelector), pressed: %s', state === 1 ? 'Down' : 'Up');
                this.setVolumeSwitch(state, callback, !state);
            });
        this.tvSpeakerService
            .getCharacteristic(Characteristic.Mute)
            .on('get', this.getMuteState.bind(this))
            .on('set', this.setMuteState.bind(this));
        this.tvSpeakerService
            .addCharacteristic(Characteristic.Volume)
            .on('get', this.getVolume.bind(this))
            .on('set', this.setVolume.bind(this));

        this.tvService.addLinkedService(this.tvSpeakerService);
        this.enabledServices.push(this.tvSpeakerService);
    }

    prepareInputSourcesService() {
        if (this.inputs === undefined || this.inputs === null || this.inputs.length <= 0) {
            return;
        }

        if (Array.isArray(this.inputs) === false) {
            this.inputs = [this.inputs];
        }

        let savedNames = {};
        try {
            savedNames = JSON.parse(fs.readFileSync(this.inputNamesFile));
        } catch (err) {
            this.log.debug('webOS - input names file does not exist');
        }

        this.inputAppIds = new Array();
        this.inputs.forEach((value, i) => {

            // get appid
            let appId = null;

            if (value.appId !== undefined) {
                appId = value.appId;
            } else {
                appId = value;
            }

            // get name		
            let inputName = appId;

            if (savedNames && savedNames[appId]) {
                inputName = savedNames[appId];
            } else if (value.name) {
                inputName = value.name;
            }

            // get params
            if (value.params) {
                this.inputParams[appId] = value.params;
            }

            // if appId not null or empty add the input
            if (appId !== undefined && appId !== null && appId !== '') {
                appId = appId.replace(/\s/g, ''); // remove all white spaces from the string

                let tmpInput = new Service.InputSource(appId, 'inputSource' + i);
                tmpInput
                    .setCharacteristic(Characteristic.Identifier, i)
                    .setCharacteristic(Characteristic.ConfiguredName, inputName)
                    .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
                    .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION)
                    .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

                tmpInput
                    .getCharacteristic(Characteristic.ConfiguredName)
                    .on('set', (name, callback) => {
                        savedNames[appId] = name;
                        fs.writeFile(this.inputNamesFile, JSON.stringify(savedNames), (err) => {
                            if (err) {
                                this.log.debug('webOS - error occured could not write input name %s', err);
                            } else {
                                this.log.debug('webOS - input name successfully saved! New name: %s AppId: %s', name, appId);
                            }
                        });
                        callback()
                    });

                this.tvService.addLinkedService(tmpInput);
                this.enabledServices.push(tmpInput);
                this.inputAppIds.push(appId);
            }

        });
    }

    // legacy service ----------------------------------------------------------------
    prepareLegacyService() {
        this.powerService = new Service.Switch(this.name + ' Power', 'powerService');
        this.powerService
            .getCharacteristic(Characteristic.On)
            .on('get', this.getPowerState.bind(this))
            .on('set', this.setPowerState.bind(this));

        this.enabledServices.push(this.powerService);

        this.prepareVolumeService();
        this.prepareInputButtonService();
        this.prepareChannelService();
        this.prepareMediaControlService();
        this.prepareChannelButtonService();
        this.prepareNotificationButtonService();
        this.prepareRemoteControlButtonService();
        this.prepareSoundOutputButtonService();
        this.prepareRemoteSequenceButtonsService();
    }

    // additional services ----------------------------------------------------------------
    prepareVolumeService() {
        if (!this.volumeControl) {
            return;
        }

        // slider/lightbulb
        if (this.volumeControl === true || this.volumeControl === 'slider') {
            this.volumeService = new Service.Lightbulb(this.name + ' Volume', 'volumeService');
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

        // volume up/down buttons
        if (this.volumeControl === true || this.volumeControl === 'buttons') {
            this.volumeUpService = new Service.Switch(this.name + ' Volume Up', 'volumeUpService');
            this.volumeUpService
                .getCharacteristic(Characteristic.On)
                .on('get', this.getVolumeSwitch.bind(this))
                .on('set', (state, callback) => {
                    this.setVolumeSwitch(state, callback, true);
                });

            this.enabledServices.push(this.volumeUpService);

            this.volumeDownService = new Service.Switch(this.name + ' Volume Down', 'volumeDownService');
            this.volumeDownService
                .getCharacteristic(Characteristic.On)
                .on('get', this.getVolumeSwitch.bind(this))
                .on('set', (state, callback) => {
                    this.setVolumeSwitch(state, callback, false);
                });

            this.enabledServices.push(this.volumeDownService);
        }
    }

    prepareInputButtonService() {
        if (this.inputs === undefined || this.inputs === null || this.inputs.length <= 0) {
            return;
        }

        if (Array.isArray(this.inputs) === false) {
            this.inputs = [this.inputs];
        }

        this.inputButtonService = new Array();
        this.inputAppIdsButton = new Array();
        this.inputs.forEach((value, i) => {

            // get appid
            let appId = null;

            if (value.appId !== undefined) {
                appId = value.appId;
            } else {
                appId = value;
            }

            // get name
            let inputName = this.name + ' App: ' + appId;

            if (value.name) {
                inputName = value.name;
            }

            // if appId not null or empty add the input
            if (appId !== undefined && appId !== null && appId !== '') {
                appId = appId.replace(/\s/g, ''); // remove all white spaces from the string
                let tmpInput = new Service.Switch(inputName, 'inputButtonService' + i);
                tmpInput
                    .getCharacteristic(Characteristic.On)
                    .on('get', (callback) => {
                        this.getAppSwitchState(callback, appId);
                    })
                    .on('set', (state, callback) => {
                        this.setAppSwitchState(state, callback, appId);
                    });

                this.enabledServices.push(tmpInput);
                this.inputButtonService.push(tmpInput);
                this.inputAppIdsButton.push(appId);
            }

        });
    }

    prepareChannelService() {
        if (!this.channelControl) {
            return;
        }

        this.channelUpService = new Service.Switch(this.name + ' Channel Up', 'channelUpService');
        this.channelUpService
            .getCharacteristic(Characteristic.On)
            .on('get', this.getChannelSwitch.bind(this))
            .on('set', (state, callback) => {
                this.setChannelSwitch(state, callback, true);
            });

        this.enabledServices.push(this.channelUpService);


        this.channelDownService = new Service.Switch(this.name + ' Channel Down', 'channelDownService');
        this.channelDownService
            .getCharacteristic(Characteristic.On)
            .on('get', this.getChannelSwitch.bind(this))
            .on('set', (state, callback) => {
                this.setChannelSwitch(state, callback, false);
            });

        this.enabledServices.push(this.channelDownService);
    }

    prepareMediaControlService() {
        if (!this.mediaControl) {
            return;
        }

        this.mediaPlayService = new Service.Switch(this.name + ' Play', 'mediaPlayService');
        this.mediaPlayService
            .getCharacteristic(Characteristic.On)
            .on('get', this.getMediaControlSwitch.bind(this))
            .on('set', (state, callback) => {
                this.setMediaControlSwitch(state, callback, 'play');
            });

        this.enabledServices.push(this.mediaPlayService);

        this.mediaPauseService = new Service.Switch(this.name + ' Pause', 'mediaPauseService');
        this.mediaPauseService
            .getCharacteristic(Characteristic.On)
            .on('get', this.getMediaControlSwitch.bind(this))
            .on('set', (state, callback) => {
                this.setMediaControlSwitch(state, callback, 'pause');
            });

        this.enabledServices.push(this.mediaPauseService);

        this.mediaStopService = new Service.Switch(this.name + ' Stop', 'mediaStopService');
        this.mediaStopService
            .getCharacteristic(Characteristic.On)
            .on('get', this.getMediaControlSwitch.bind(this))
            .on('set', (state, callback) => {
                this.setMediaControlSwitch(state, callback, 'stop');
            });

        this.enabledServices.push(this.mediaStopService);

        this.mediaRewindService = new Service.Switch(this.name + ' Rewind', 'mediaRewindService');
        this.mediaRewindService
            .getCharacteristic(Characteristic.On)
            .on('get', this.getMediaControlSwitch.bind(this))
            .on('set', (state, callback) => {
                this.setMediaControlSwitch(state, callback, 'rewind');
            });

        this.enabledServices.push(this.mediaRewindService);

        this.mediaFastForwardService = new Service.Switch(this.name + ' Fast Forward', 'mediaFastForwardService');
        this.mediaFastForwardService
            .getCharacteristic(Characteristic.On)
            .on('get', this.getMediaControlSwitch.bind(this))
            .on('set', (state, callback) => {
                this.setMediaControlSwitch(state, callback, 'fastForward');
            });

        this.enabledServices.push(this.mediaFastForwardService);
    }

    prepareChannelButtonService() {
        if (this.channelButtons === undefined || this.channelButtons === null || this.channelButtons.length <= 0) {
            return;
        }

        if (Array.isArray(this.channelButtons) === false) {
            this.channelButtons = [this.channelButtons];
        }

        this.channelButtonService = new Array();
        this.channelButtons.forEach((value, i) => {
            this.channelButtons[i] = this.channelButtons[i].toString();
            let tmpChannel = new Service.Switch(this.name + ' Channel: ' + value, 'channelButtonService' + i);
            tmpChannel
                .getCharacteristic(Characteristic.On)
                .on('get', (callback) => {
                    this.getChannelButtonState(callback, this.channelButtons[i]);
                })
                .on('set', (state, callback) => {
                    this.setChannelButtonState(state, callback, this.channelButtons[i]);
                });

            this.enabledServices.push(tmpChannel);
            this.channelButtonService.push(tmpChannel);
        });
    }

    prepareNotificationButtonService() {
        if (this.notificationButtons === undefined || this.notificationButtons === null || this.notificationButtons.length <= 0) {
            return;
        }

        if (Array.isArray(this.notificationButtons) === false) {
            this.notificationButtons = [this.notificationButtons];
        }

        this.notificationButtonService = new Array();
        this.notificationButtons.forEach((value, i) => {
            this.notificationButtons[i] = this.notificationButtons[i].toString();
            let tmpNotification = new Service.Switch(this.name + ' Notification: ' + value, 'notificationButtonService' + i);
            tmpNotification
                .getCharacteristic(Characteristic.On)
                .on('get', (callback) => {
                    this.getNotificationButtonState(callback);
                })
                .on('set', (state, callback) => {
                    this.setNotificationButtonState(state, callback, this.notificationButtons[i]);
                });

            this.enabledServices.push(tmpNotification);
            this.notificationButtonService.push(tmpNotification);
        });
    }

    prepareRemoteControlButtonService() {
        if (this.remoteControlButtons === undefined || this.remoteControlButtons === null || this.remoteControlButtons.length <= 0) {
            return;
        }

        if (Array.isArray(this.remoteControlButtons) === false) {
            this.remoteControlButtons = [this.remoteControlButtons];
        }

        this.remoteControlButtonService = new Array();
        this.remoteControlButtons.forEach((value, i) => {
            this.remoteControlButtons[i] = this.remoteControlButtons[i].toString().toUpperCase();
            let tmpRemoteControl = new Service.Switch(this.name + ' RC: ' + value, 'remoteControlButtonService' + i);
            tmpRemoteControl
                .getCharacteristic(Characteristic.On)
                .on('get', (callback) => {
                    this.getRemoteControlButtonState(callback);
                })
                .on('set', (state, callback) => {
                    this.setRemoteControlButtonState(state, callback, this.remoteControlButtons[i]);
                });

            this.enabledServices.push(tmpRemoteControl);
            this.remoteControlButtonService.push(tmpRemoteControl);
        });
    }

    prepareSoundOutputButtonService() {
        if (this.soundOutputButtons === undefined || this.soundOutputButtons === null || this.soundOutputButtons.length <= 0) {
            return;
        }

        if (Array.isArray(this.soundOutputButtons) === false) {
            this.soundOutputButtons = [this.soundOutputButtons];
        }

        this.soundOutputButtonService = new Array();
        this.soundOutputButtons.forEach((value, i) => {
            this.soundOutputButtons[i] = this.soundOutputButtons[i].toString();
            let tmpSoundOutput = new Service.Switch(this.name + ' SO: ' + value, 'soundOutputButtonService' + i);
            tmpSoundOutput
                .getCharacteristic(Characteristic.On)
                .on('get', (callback) => {
                    this.getSoundOutputButtonState(callback, this.soundOutputButtons[i]);
                })
                .on('set', (state, callback) => {
                    this.setSoundOutputButtonState(state, callback, this.soundOutputButtons[i]);
                });

            this.enabledServices.push(tmpSoundOutput);
            this.soundOutputButtonService.push(tmpSoundOutput);
        });
    }

    prepareRemoteSequenceButtonsService() {
        if (this.remoteSequenceButtons === undefined || this.remoteSequenceButtons === null || this.remoteSequenceButtons.length <= 0) {
            return;
        }

        if (Array.isArray(this.remoteSequenceButtons) === false) {
            return;
        }

        this.remoteSequenceButtonsService = new Array();
        this.remoteSequenceButtons.forEach((value, i) => {

            let tmpSeq = value;
            if (tmpSeq === null || tmpSeq === undefined || tmpSeq.sequence === undefined || Array.isArray(tmpSeq.sequence) === false) {
                return;
            }

            // get sequence name
            let sequenceName = this.name + ' Sequence ' + i;
            if (tmpSeq.name) {
                sequenceName = tmpSeq.name;
            }

            // get/adjust sequence interval
            if (tmpSeq.interval !== undefined && tmpSeq.interval !== null) {
                if (Array.isArray(tmpSeq.interval) === false) {
                    if (isNaN(tmpSeq.interval) === false) {
                        tmpSeq.interval = [parseInt(tmpSeq.interval)];
                    } else {
                        tmpSeq.interval = undefined;
                    }
                }
            }

            if (tmpSeq.interval === undefined || tmpSeq.interval === null) { // if sequence interval still not set use default value
                tmpSeq.interval = [500]; // default value, interval 500ms
            }

            let tmpRemoteSequence = new Service.Switch(sequenceName, 'remoteSequenceButtonsService' + i);
            tmpRemoteSequence
                .getCharacteristic(Characteristic.On)
                .on('get', (callback) => {
                    this.getRemoteSequenceButtonState(callback);
                })
                .on('set', (state, callback) => {
                    this.setRemoteSequenceButtonState(state, callback, tmpSeq);
                });

            this.enabledServices.push(tmpRemoteSequence);
            this.remoteSequenceButtonsService.push(tmpRemoteSequence);

        });
    }

    // --== HELPER METHODS ==--
    setMuteStateManually(value) {
        if (this.volumeService) this.volumeService.getCharacteristic(Characteristic.On).updateValue(value);
    }

    setVolumeManually(value, statusCause) {
        if (this.volumeService) this.volumeService.getCharacteristic(Characteristic.Brightness).updateValue(value);

        // automation trigger for volume up button
        if (statusCause === 'volumeUp' && this.volumeUpService) {
            this.volumeUpService.getCharacteristic(Characteristic.On).updateValue(true);
            setTimeout(() => {
                this.volumeUpService.getCharacteristic(Characteristic.On).updateValue(false);
            }, 300);

        }

        // automation trigger for volume down button
        if (statusCause === 'volumeDown' && this.volumeDownService) {
            this.volumeDownService.getCharacteristic(Characteristic.On).updateValue(true);
            setTimeout(() => {
                this.volumeDownService.getCharacteristic(Characteristic.On).updateValue(false);
            }, 300);

        }
    }

    setAppSwitchManually(error, value, appId) {
        if (this.inputButtonService) {
            if (appId === undefined || appId === null || appId.length <= 0) {
                this.inputButtonService.forEach((tmpInputButton, i) => {
                    tmpInputButton.getCharacteristic(Characteristic.On).updateValue(value);
                });
            } else {
                this.inputButtonService.forEach((tmpInputButton, i) => {
                    if (appId === this.inputAppIdsButton[i]) {
                        tmpInputButton.getCharacteristic(Characteristic.On).updateValue(value);
                    } else {
                        tmpInputButton.getCharacteristic(Characteristic.On).updateValue(false);
                    }
                });
            }
        }
    }

    setChannelButtonManually(error, value, channelNumber) {
        if (this.channelButtonService) {
            if (channelNumber === undefined || channelNumber === null || channelNumber.length <= 0) {
                this.channelButtonService.forEach((tmpChannelButton, i) => {
                    tmpChannelButton.getCharacteristic(Characteristic.On).updateValue(value);
                });
            } else {
                this.channelButtonService.forEach((tmpChannelButton, i) => {
                    if (channelNumber === this.channelButtons[i]) {
                        tmpChannelButton.getCharacteristic(Characteristic.On).updateValue(value);
                    } else {
                        tmpChannelButton.getCharacteristic(Characteristic.On).updateValue(false);
                    }
                });
            }
        }
    }

    setSoundOutputManually(error, value, soundOutput) {
        if (this.soundOutputButtonService) {
            if (soundOutput === undefined || soundOutput === null || soundOutput.length <= 0) {
                this.soundOutputButtonService.forEach((tmpSoundOutputButton, i) => {
                    tmpSoundOutputButton.getCharacteristic(Characteristic.On).updateValue(value);
                });
            } else {
                this.soundOutputButtonService.forEach((tmpSoundOutputButton, i) => {
                    if (soundOutput === this.soundOutputButtons[i]) {
                        tmpSoundOutputButton.getCharacteristic(Characteristic.On).updateValue(value);
                    } else {
                        tmpSoundOutputButton.getCharacteristic(Characteristic.On).updateValue(false);
                    }
                });
            }
        }
    }

    disableAllServiceButtons(service) {
        if (service) {
            // we need to wait a moment (10ms) till we can disable the button
            setTimeout(() => {
                service.forEach((tmpServiceButton, i) => {
                    tmpServiceButton.getCharacteristic(Characteristic.On).updateValue(false);
                });
            }, 10);
        }
    }

    updateAccessoryStatus() {
        if (this.inputButtonService) this.checkForegroundApp(this.setAppSwitchManually.bind(this));
        if (this.channelButtonService) this.checkCurrentChannel(this.setChannelButtonManually.bind(this));
        if (this.soundOutputButtonService) this.checkSoundOutput(this.setSoundOutputManually.bind(this));
    }

    updateTvStatus(error, tvStatus) {
        if (!tvStatus) {
            if (this.powerService) this.powerService.getCharacteristic(Characteristic.On).updateValue(false);
            if (this.tvService) this.tvService.getCharacteristic(Characteristic.Active).updateValue(false); //tv service
            if (this.volumeService) this.volumeService.getCharacteristic(Characteristic.On).updateValue(false);
            this.setAppSwitchManually(null, false, null);
            this.setChannelButtonManually(null, false, null);
            this.setMuteStateManually(false);
            this.setSoundOutputManually(null, false, null);
        } else {
            if (this.powerService) this.powerService.getCharacteristic(Characteristic.On).updateValue(true);
            if (this.tvService) this.tvService.getCharacteristic(Characteristic.Active).updateValue(true); //tv service
        }
    }

    powerOnTvWithCallback(callback) {
        wol.wake(this.mac, {
            'address': this.broadcastAdr
        }, (error) => {
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
    }

    checkTVState(callback) {
        tcpp.probe(this.ip, TV_WEBSOCKET_PORT, (err, isAlive) => {
            if (!isAlive && this.connected) {
                this.log.debug('webOS - TV state: Off');
                this.disconnect();
                callback(null, false);
            } else if (isAlive && !this.connected) {
                this.lgtv.connect(this.url);
                this.log.debug('webOS - TV state: got response from TV, connecting...');
            }
        });
    }

    checkForegroundApp(callback, appId) {
        if (this.connected) {
            this.lgtv.request('ssap://com.webos.applicationManager/getForegroundAppInfo', (err, res) => {
                if (!res || err || res.errorCode || res.appId === '') {
                    this.log.debug('webOS - current app - error while getting current app info');
                    callback(null, false, null); // disable all switches
                } else {
                    this.log.debug('webOS - TV current appId: %s', res.appId);
                    if (appId === undefined || appId === null) { // if appId undefined or null then i am checking which app is currently running; if set then continue normally
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
    }

    checkCurrentChannel(callback, channelNum) {
        if (this.connected) {
            this.lgtv.request('ssap://tv/getCurrentChannel', (err, res) => {
                if (!res || err || res.errorCode) {
                    this.log.debug('webOS - current channel - error while getting current channel info');
                    callback(null, false, null); // disable all switches
                } else {
                    this.log.debug('webOS - TV current channel: %s, %s', res.channelNumber, res.channelName);
                    if (channelNum === undefined || channelNum === null) { // if channelNum undefined or null then i am checking which channel is currently running; if set then continue normally
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
    }

    checkSoundOutput(callback, soundOutput) {
        if (this.connected) {
            this.lgtv.request('ssap://com.webos.service.apiadapter/audio/getSoundOutput', (err, res) => {
                if (!res || err || res.errorCode) {
                    this.log.debug('webOS - sound output - error while getting current sound output');
                    callback(null, false, null); // disable all switches
                } else {
                    this.log.debug('webOS - TV current sound output: %s', res.soundOutput);
                    if (soundOutput === undefined || soundOutput === null) { // if output undefined or null then i am checking which sound output is currently set; if set then continue normally
                        callback(null, true, res.soundOutput);
                    } else if (res.soundOutput === soundOutput) {
                        callback(null, true, soundOutput);
                    } else {
                        callback(null, false, soundOutput);
                    }
                }
            });
        } else {
            callback(null, false);
        }
    }

    openChannel(channelNum) {
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
    }


    // --== HOMEBRIDGE STATE SETTERS/GETTERS ==--
    getPowerState(callback) {
        callback(null, this.connected);
    }

    setPowerState(state, callback) {
        if (state) {
            this.log.debug('webOS - power service - Trying to power on tv, sending magic packet');
            wol.wake(this.mac, {
                'address': this.broadcastAdr
            }, (error) => {
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
                    this.disconnect();
                })
            }
            callback();
        }
    }

    getMuteState(callback) {
        if (this.connected) {
            callback(null, !this.tvMuted);
        } else {
            callback(null, false);
        }
    }

    setMuteState(state, callback) {
        if (this.connected) {
            this.log.debug('webOS - volume service - TV %s', !state ? 'Muted' : 'Unmuted');
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
    }

    getVolume(callback) {
        if (this.connected) {
            callback(null, this.tvVolume);
        } else {
            callback(null, 0);
        }
    }

    setVolume(level, callback) {
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
            callback(new Error('webOS - TV is not connected, cannot set volume'));
        }
    }

    getVolumeSwitch(callback) {
        callback(null, false);
    }

    setVolumeSwitch(state, callback, isUp) {
        if (this.connected) {
            this.log.debug('webOS - volume service - volume %s pressed, current volume: %s, limit: %s', isUp ? 'Up' : 'Down', this.tvVolume, this.volumeLimit);
            let volLevel = this.tvVolume;
            if (isUp) {
                if (volLevel < this.volumeLimit) {
                    this.lgtv.request('ssap://audio/volumeUp');
                }
            } else {
                this.lgtv.request('ssap://audio/volumeDown');
            }
            setTimeout(() => {
                if (this.volumeUpService) this.volumeUpService.getCharacteristic(Characteristic.On).updateValue(false);
                if (this.volumeDownService) this.volumeDownService.getCharacteristic(Characteristic.On).updateValue(false);
            }, 10);
            callback();
        } else {
            callback(new Error('webOS - volume service - TV is not connected, cannot set volume'));
        }
    }

    getChannelSwitch(callback) {
        callback(null, false);
    }

    setChannelSwitch(state, callback, isUp) {
        if (this.connected) {
            this.log.debug('webOS - channel service - channel %s pressed', isUp ? 'Up' : 'Down');
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
            callback(new Error('webOS - channel service - TV is not connected, cannot change channel'));
        }
    }

    getAppSwitchState(callback, appId) {
        if (!this.connected) {
            callback(null, false);
        } else {
            setTimeout(this.checkForegroundApp.bind(this, callback, appId), 50);
        }
    }

    setAppSwitchState(state, callback, appId) {
        if (this.connected) {
            if (state) {
                this.log.debug('webOS - app switch service - launching app with id %s', appId);
                if (this.inputParams[appId]) {
                    // launch with input params
                    this.log.debug('webOS - app switch service - params specified, adding params: %s', JSON.stringify(this.inputParams[appId]));
                    this.lgtv.request('ssap://com.webos.applicationManager/launch', {
                        id: appId,
                        params: this.inputParams[appId]
                    });
                } else {
                    // launch without input params
                    this.lgtv.request('ssap://system.launcher/launch', {
                        id: appId
                    });
                }
                this.setAppSwitchManually(null, true, appId);
                this.setChannelButtonManually(null, false, null);
            } else { // prevent turning off the switch, since this is the current app we should not turn off the switch
                setTimeout(() => {
                    this.setAppSwitchManually(null, true, appId);
                }, 10);
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
    }

    getMediaControlSwitch(callback) {
        callback(null, false);
    }

    setMediaControlSwitch(state, callback, action) {
        if (this.connected) {
            this.log.debug('webOS - media control service - current media %s', action);
            if (action === 'play') {
                this.lgtv.request('ssap://media.controls/play');
            } else if (action === 'pause') {
                this.lgtv.request('ssap://media.controls/pause');
            } else if (action === 'stop') {
                this.lgtv.request('ssap://media.controls/stop');
            } else if (action === 'rewind') {
                this.lgtv.request('ssap://media.controls/rewind');
            } else if (action === 'fastForward') {
                this.lgtv.request('ssap://media.controls/fastForward');
            }
            setTimeout(() => {
                if (this.mediaPlayService) this.mediaPlayService.getCharacteristic(Characteristic.On).updateValue(false);
                if (this.mediaPauseService) this.mediaPauseService.getCharacteristic(Characteristic.On).updateValue(false);
                if (this.mediaStopService) this.mediaStopService.getCharacteristic(Characteristic.On).updateValue(false);
                if (this.mediaRewindService) this.mediaRewindService.getCharacteristic(Characteristic.On).updateValue(false);
                if (this.mediaFastForwardService) this.mediaFastForwardService.getCharacteristic(Characteristic.On).updateValue(false);
            }, 10);
            callback();
        } else {
            callback(new Error('webOS - media control service - is not connected, cannot control media'));
        }
    }

    getChannelButtonState(callback, channelNum) {
        if (!this.connected) {
            callback(null, false);
        } else {
            setTimeout(this.checkCurrentChannel.bind(this, callback, channelNum), 50);
        }
    }

    setChannelButtonState(state, callback, channelNum) {
        if (this.connected) {
            if (state) {
                if (this.tvCurrentAppId === 'com.webos.app.livetv') { // it is only possible to switch channels when we are in the livetv app
                    this.log.debug('webOS - channel button service - switching to channel number %s', channelNum);
                    this.openChannel(channelNum);
                } else { // if we are not in the livetv app, then switch to the livetv app and set launchLiveTvChannel, after the app is switched the channel will be switched to the selected
                    this.log.debug('webOS - channel button service - trying to switch to channel %s but the livetv app is not running, switching to livetv app', channelNum);
                    this.launchLiveTvChannel = channelNum;
                    this.lgtv.request('ssap://system.launcher/launch', {
                        id: 'com.webos.app.livetv'
                    });
                }
                this.setChannelButtonManually(null, true, channelNum); // enable the selected channel switch and disable all other
                this.setAppSwitchManually(null, true, 'com.webos.app.livetv'); // disable all appswitches if active, except live tv
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
    }

    getNotificationButtonState(callback) {
        callback(null, false);
    }

    setNotificationButtonState(state, callback, notification) {
        if (this.connected) {
            this.log.debug('webOS - notification button service - displaying notification with message: %s', notification);
            this.lgtv.request('ssap://system.notifications/createToast', {
                message: notification
            });
        }
        this.disableAllServiceButtons(this.notificationButtonService);
        callback(); // always report success, if i return an error here then siri will respond with 'Some device are not responding' which is bad for automation or scenes
    }

    getRemoteControlButtonState(callback) {
        callback(null, false);
    }

    setRemoteControlButtonState(state, callback, rcButton) {
        if (this.connected && this.pointerInputSocket) {
            this.log.debug('webOS - remote control button service - emulating remote control %s press', rcButton);
            if (rcButton === 'CLICK') {
                this.pointerInputSocket.send('click');
            } else {
                this.pointerInputSocket.send('button', {
                    name: rcButton
                });
            }
        }
        this.disableAllServiceButtons(this.remoteControlButtonService);
        if (callback !== null) { // only if callback is not null, when a sequence is fired then the sequence button press calls the callback and not this one!
            callback(); // always report success, if i return an error here then siri will respond with 'Some device are not responding' which is bad for automation or scenes	
        }
    }

    remoteKeyPress(remoteKey, callback) {
        this.log.debug('webOS - remote key pressed: %d', remoteKey);

        switch (remoteKey) {
            case Characteristic.RemoteKey.REWIND:
                this.setRemoteControlButtonState(true, callback, 'REWIND');
                break;
            case Characteristic.RemoteKey.FAST_FORWARD:
                this.setRemoteControlButtonState(true, callback, 'FASTFORWARD');
                break;
            case Characteristic.RemoteKey.NEXT_TRACK:
                // does a endpoint call exist?
                this.log.info('webOS - next track remote key not supported');
                callback();
                break;
            case Characteristic.RemoteKey.PREVIOUS_TRACK:
                // does a endpoint call exist?
                this.log.info('webOS - previous track remote key not supported');
                callback();
                break;
            case Characteristic.RemoteKey.ARROW_UP:
                this.setRemoteControlButtonState(true, callback, 'UP');
                break;
            case Characteristic.RemoteKey.ARROW_DOWN:
                this.setRemoteControlButtonState(true, callback, 'DOWN');
                break;
            case Characteristic.RemoteKey.ARROW_LEFT:
                this.setRemoteControlButtonState(true, callback, 'LEFT');
                break;
            case Characteristic.RemoteKey.ARROW_RIGHT:
                this.setRemoteControlButtonState(true, callback, 'RIGHT');
                break;
            case Characteristic.RemoteKey.SELECT:
                this.setRemoteControlButtonState(true, callback, 'ENTER');
                break;
            case Characteristic.RemoteKey.BACK:
                this.setRemoteControlButtonState(true, callback, 'BACK');
                break;
            case Characteristic.RemoteKey.EXIT:
                this.setRemoteControlButtonState(true, callback, 'EXIT');
                break;
            case Characteristic.RemoteKey.PLAY_PAUSE:
                if (this.isPaused) {
                    this.setRemoteControlButtonState(true, callback, 'PLAY');
                } else {
                    this.setRemoteControlButtonState(true, callback, 'PAUSE');
                }
                this.isPaused = !this.isPaused;
                break;
            case Characteristic.RemoteKey.INFORMATION:
                this.setRemoteControlButtonState(true, callback, this.infoButtonAction);
                break;
        }
    }

    getSoundOutputButtonState(callback, soundOutput) {
        if (!this.connected) {
            callback(null, false);
        } else {
            setTimeout(this.checkSoundOutput.bind(this, callback, soundOutput), 50);
        }
    }

    setSoundOutputButtonState(state, callback, soundOutput) {
        if (this.connected) {
            if (state) {
                this.lgtv.request('ssap://com.webos.service.apiadapter/audio/changeSoundOutput', {
                    output: soundOutput
                }, (err, res) => {
                    if (!res || err || res.errorCode || !res.returnValue) {
                        this.log.debug('webOS - sound output - error while changing sound output');
                        if (res && res.errorText) {
                            this.log.debug('webOS - sound output - error message: %s', res.errorText);
                        }
                    } else {
                        this.log.debug('webOS - sound output - sound output changed successfully');
                    }
                });
                this.setSoundOutputManually(null, true, soundOutput); // enable the selected channel switch and disable all other
            } else { // prevent turning off the switch, since this is the current sound output we should not turn off the switch
                setTimeout(() => {
                    this.setSoundOutputManually(null, true, soundOutput);
                }, 10);
            }
            callback();
        } else {
            callback(new Error('webOS - sound output service - TV is not connected, cannot change channel'));
        }
    }

    getRemoteSequenceButtonState(callback) {
        callback(null, false);
    }

    setRemoteSequenceButtonState(state, callback, seqObj) {
        if (this.connected && this.pointerInputSocket) {
            this.log.debug('webOS - remote sequence button service - emulating remote control sequence: %s with interval %s ms', seqObj.sequence.join(), seqObj.interval.join());
            let curRemoteKeyNum = 0;
            let remoteKeyFunc = () => {
                let curRemoteKey = seqObj.sequence[curRemoteKeyNum];
                this.setRemoteControlButtonState(true, null, curRemoteKey);

                if (curRemoteKeyNum < seqObj.sequence.length - 1) {
                    let curInterval = seqObj.interval[curRemoteKeyNum] || seqObj.interval[seqObj.interval.length - 1];
                    curRemoteKeyNum++;
                    setTimeout(remoteKeyFunc, curInterval);
                }
            };
            remoteKeyFunc();
        }
        this.disableAllServiceButtons(this.remoteSequenceButtonsService);
        callback(); // always report success, if i return an error here then siri will respond with 'Some device are not responding' which is bad for automation or scenes
    }


    getServices() {
        return this.enabledServices;
    }

}


// --== PLATFORM STUFF  ==--
class webosTvPlatform {
    constructor(log, config, api) {
        if (!config) {
            return;
        }

        this.log = log;
        this.api = api;
        this.config = config;

        if (this.api) {
            this.api.on('didFinishLaunching', this.initDevices.bind(this));
        }

    }

    initDevices() {
        this.log.info('webOS - init - initializing devices');

        // read from config.devices
        if (this.config.devices) {
            for (let device of this.config.devices) {
                if (device) {
                    new webosTvDevice(this.log, device, this.api);
                }
            }
        }

        // also read from config.tvs
        if (this.config.tvs) {
            for (let tv of this.config.tvs) {
                if (tv) {
                    new webosTvDevice(this.log, tv, this.api);
                }
            }
        }

        if (!this.config.devices && !this.config.tvs) {
            this.log.info('-------------------------------------------');
            this.log.info('webOS - init - no tv configuration found');
            this.log.info('Missing devices or tvs in your platform config');
            this.log.info('-------------------------------------------');
        }
    }

    configureAccessory(platformAccessory) {
        // Won't be invoked
    }

    removeAccessory(platformAccessory) {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [platformAccessory]);
    }
}


class webosTvDevice extends webosTvAccessory {
    constructor(log, config, api) {
        super(log, config, api);

        this.log.info(`webOS - init - initializing device with name: ${this.name}`);

        // generate uuid
        this.UUID = Homebridge.hap.uuid.generate(config.mac + config.ip);

        // prepare the tv accessory
        this.tvAccesory = new Accessory(this.name, this.UUID, Homebridge.hap.Accessory.Categories.TELEVISION);

        // remove the preconstructed information service, since i will be adding my own
        this.tvAccesory.removeService(this.tvAccesory.getService(Service.AccessoryInformation));

        // add all the services to the accessory
        for (let service of this.enabledServices) {
            this.tvAccesory.addService(service);
        }

        this.api.publishExternalAccessories(PLUGIN_NAME, [this.tvAccesory]);
    }
}
