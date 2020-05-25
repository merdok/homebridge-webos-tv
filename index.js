const Lgtv2 = require('lgtv2');
const wol = require('wake_on_lan');
const tcpp = require('tcp-ping');
const fs = require('fs');
const ppath = require('persist-path');
const mkdirp = require('mkdirp');

let Service, Characteristic, Homebridge, Accessory;
let lgtv, pointerInputSocket;

const PLUGIN_NAME = 'homebridge-webos-tv';
const PLATFORM_NAME = 'webostv';
const PLUGIN_VERSION = '1.8.0';
const TV_WEBSOCKET_PORT = 3000;

const WEBOS_LIVE_TV_APP_ID = 'com.webos.app.livetv';

module.exports = (homebridge) => {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Homebridge = homebridge;
    Accessory = homebridge.platformAccessory;
    homebridge.registerAccessory(PLUGIN_NAME, PLATFORM_NAME, webosTvAccessory);
    homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, webosTvPlatform, true);
};


class webosTvDevice {
    constructor(log, config, api) {
        this.log = log;
        this.api = api;

        // check if we have mandatory device info
        if (!config.ip) throw new Error(`TV ip address is required for ${config.name}`);
        if (!config.mac) throw new Error(`TV mac address is required for ${config.name}`);

        // configuration
        this.name = config.name || 'webOS TV';
        this.ip = config.ip;
        this.mac = config.mac;
        this.broadcastAdr = config.broadcastAdr || '255.255.255.255';
        this.keyFile = config.keyFile;
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

        this.launchPointsList = [];
        this.channelList = [];


        // check if prefs directory ends with a /, if not then add it
        if (this.prefsDir.endsWith('/') === false) {
            this.prefsDir = this.prefsDir + '/';
        }

        // check if the tv preferences directory exists, if not then create it
        if (fs.existsSync(this.prefsDir) === false) {
            mkdirp(this.prefsDir);
        }

        // prepare file paths
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
            this.logDebug('Connected to TV, checking power status');
            this.lgtv.request('ssap://com.webos.service.tvpower/power/getPowerState', (err, res) => {
                if (err || (res && res.state && res.state === 'Active Standby')) {
                    this.logDebug('Power status - TV is Off or Pixel Refresher is running, disconnecting');
                    this.connected = false;
                    this.lgtv.disconnect();
                } else {
                    this.logDebug('Power status - TV is On');
                    this.connected = true;
                    this.connect();
                }
            });
        });

        this.lgtv.on('close', () => {
            this.logDebug('Disconnected from TV');
            this.connected = false;
            this.pointerInputSocket = null;
            this.updateTvStatus(null, false);
        });

        this.lgtv.on('error', (error) => {
            this.logError('Error - %s', error);
        });

        this.lgtv.on('prompt', () => {
            this.logInfo('Prompt for confirmation');
            this.connected = false;
        });

        this.lgtv.on('connecting', () => {
            this.logDebug('Connecting to TV');
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
        this.logInfo('Connected to TV');
        this.connected = true;
        this.getTvInformation().then(() => {
            this.logDebug('Got TV information proceeding with launch');
            this.updateTvStatus(null, true);
            this.subscribeToServices();
            this.connectToPointerInputSocket();
            this.updateAccessoryStatus();
        });
    }

    disconnect() {
        this.logInfo('Disconnected from TV');
        this.lgtv.disconnect();
        this.connected = false;
        this.updateTvStatus(null, false);
    }

    connectToPointerInputSocket() {
        this.logDebug('Connecting to remote control socket');
        this.lgtv.getSocket('ssap://com.webos.service.networkinput/getPointerInputSocket', (err, sock) => {
            if (!err) {
                this.pointerInputSocket = sock;
            } else {
                this.logError('Remote control socket error - %s', error);
            }
        });
    }


    // --== INIT HELPER METHODS ==--
    async getTvInformation() {
        this.logDebug('Requesting TV information');
        let tvInfoPromises = [];

        tvInfoPromises.push(new Promise((resolve, reject) => {
            this.lgtv.request('ssap://system/getSystemInfo', (err, res) => {
                if (!res || err || res.errorCode) {
                    this.logRequestDebug('System info - error while getting system info', err, res);
                } else {
                    delete res['returnValue'];
                    this.logDebug('System info: \n' + JSON.stringify(res, null, 2));
                    // save the tv info to a file if does not exists
                    if (fs.existsSync(this.tvInfoFile) === false) {
                        fs.writeFile(this.tvInfoFile, JSON.stringify(res), (err) => {
                            if (err) {
                                this.logError('Error occured, could not write TV info %s', err);
                            } else {
                                this.logDebug('TV info successfully saved!');
                            }
                        });
                    } else {
                        this.logDebug('TV info file already exists, not saving!');
                    }
                }
                resolve();
            });
        }));

        tvInfoPromises.push(new Promise((resolve, reject) => {
            this.lgtv.request('ssap://com.webos.service.update/getCurrentSWInformation', (err, res) => {
                if (!res || err || res.errorCode) {
                    this.logRequestDebug('Sw information - error while getting sw information', err, res);
                } else {
                    delete res['returnValue'];
                    this.logDebug('Sw information: \n' + JSON.stringify(res, null, 2));
                }
                resolve();
            });
        }));

        tvInfoPromises.push(new Promise((resolve, reject) => {
            this.lgtv.request('ssap://api/getServiceList', (err, res) => {
                if (!res || err || res.errorCode) {
                    this.logRequestDebug('Service list - error while getting service list', err, res);
                } else {
                    delete res['returnValue'];
                    this.logDebug('Service list: \n' + JSON.stringify(res, null, 2));
                }
                resolve();
            });
        }));

        tvInfoPromises.push(new Promise((resolve, reject) => {
            this.lgtv.request('ssap://com.webos.applicationManager/listLaunchPoints', (err, res) => {
                if (!res || err || res.errorCode) {
                    this.logRequestDebug('Launch points list - error while getting the launch points list', err, res);
                } else {
                    if (res && res.launchPoints && Array.isArray(res.launchPoints)) {
                        for (let launchPoint of res.launchPoints) {
                            let newObj = {};
                            newObj.appId = launchPoint.id;
                            newObj.name = launchPoint.title;
                            this.launchPointsList.push(newObj);
                        }
                        this.logDebug('Launch points (inputs, apps): \n' + JSON.stringify(this.launchPointsList, null, 2));
                    } else {
                        this.logDebug('Launch points list - error while parsing the launch point list \n' + JSON.stringify(res, null, 2));
                    }
                }
                resolve();
            });
        }));

        tvInfoPromises.push(new Promise((resolve, reject) => {
            this.lgtv.request('ssap://tv/getChannelList', (err, res) => {
                if (!res || err || res.errorCode) {
                    this.logRequestDebug('Channel list - error while getting the channel list', err, res);
                } else {
                    if (res && res.channelList && Array.isArray(res.channelList)) {
                        for (let channelInfo of res.channelList) {
                            let newObj = {};
                            if (channelInfo.Radio == false) { // skip radio stations
                                newObj.channelId = channelInfo.channelId;
                                newObj.channelNumber = channelInfo.channelNumber;
                                newObj.channelName = channelInfo.channelName;
                                this.channelList.push(newObj);
                            }
                        }
                        //	this.logDebug('Channel list: \n' + JSON.stringify(this.channelList, null, 2));
                    } else {
                        this.logDebug('Channel list - error while parsing channel list \n' + JSON.stringify(res, null, 2));
                    }
                }
                resolve();
            });
        }));

        await Promise.allSettled(tvInfoPromises);
    }

    subscribeToServices() {
        this.logDebug('Subscribing to TV services');

        // power status
        this.lgtv.subscribe('ssap://com.webos.service.tvpower/power/getPowerState', (err, res) => {
            if (!res || err || res.errorCode) {
                this.logRequestError('TV power status - error while getting power status', err, res);
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

                this.logDebug('TV power status changed, status: %s', powerState);

                // if pixel refresher is running then disconnect from TV
                if (statusState === 'Active Standby') {
                    this.disconnect();
                }
            }
        });

        // foreground app info
        this.lgtv.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', (err, res) => {
            if (!res || err || res.errorCode) {
                this.logRequestError('TV app check - error while getting current app', err, res);
            } else {
                if (res.appId) {
                    this.tvCurrentAppId = res.appId;
                    this.setAppSwitchManually(null, true, this.tvCurrentAppId);
                    this.logInfo('App launched, current appId: %s', res.appId);
                    if (this.channelButtonService) {
                        if (this.tvCurrentAppId === WEBOS_LIVE_TV_APP_ID) {
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
                            this.logDebug('Input not found in the input list, not selecting any input');
                        }
                        this.tvService.getCharacteristic(Characteristic.ActiveIdentifier).updateValue(inputIdentifier);
                    }
                }
            }
        });

        // audio status
        this.lgtv.subscribe('ssap://audio/getStatus', (err, res) => {
            if (!res || err || res.errorCode) {
                this.logRequestError('TV audio status - error while getting current audio status', err, res);
            } else {
                this.logInfo('Audio status changed');

                // check if volumeUp or volumeDown was pressed, holds volumeUp or volumeDown if one of those was pressed or is not present if not
                let statusCause = (res && res.cause ? res.cause : null);

                // volume state
                this.tvVolume = res.volume;
                this.setVolumeManually(this.tvVolume, statusCause);
                this.logInfo('Current volume: %s', res.volume);

                // mute state
                this.tvMuted = res.mute;
                this.setMuteStateManually(!this.tvMuted);
                this.logInfo('Muted: %s', res.mute ? 'Yes' : 'No');
            }
        });

        // current channel
        this.lgtv.subscribe('ssap://tv/getCurrentChannel', (err, res) => {
            if (!res || err || res.errorCode) {
                this.logRequestError('TV channel status - error while getting current channel status', err, res);
            } else {
                if (this.tvCurrentChannel !== res.channelNumber) {
                    this.logInfo('Current channel status changed');
                    // channel changed
                    this.tvCurrentChannel = res.channelNumber;
                    this.setChannelButtonManually(null, true, res.channelNumber);
                    this.logInfo('Current channel: %s, %s, channelId: %s', res.channelNumber, res.channelName, res.channelId);
                }
            }
        });

        // sound output
        this.lgtv.subscribe('ssap://com.webos.service.apiadapter/audio/getSoundOutput', (err, res) => {
            if (!res || err || res.errorCode) {
                this.logRequestError('TV sound output - error while getting current sound output status', err, res);
            } else {
                if (this.tvCurrentSoundOutput !== res.soundOutput) {
                    this.logInfo('Sound output changed');
                    // sound output changed
                    this.tvCurrentSoundOutput = res.soundOutput;
                    this.setSoundOutputManually(null, true, res.soundOutput);
                    this.logInfo('Current sound output: %s', res.soundOutput);
                }
            }
        });
    }


    // --== SETUP SERVICES  ==--
    prepareInformationService() {
        // currently i save the tv info in a file and load if it exists
        let modelName = "Unknown model";
        try {
            let infoArr = JSON.parse(fs.readFileSync(this.tvInfoFile));
            modelName = infoArr.modelName;
        } catch (err) {
            this.logDebug('Input names file does not exist');
        }

        // there is currently no way to update the AccessoryInformation service after it was added to the service list
        // when this is fixed in homebridge, update the informationService with the TV info?
        let informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, 'LG Electronics Inc.')
            .setCharacteristic(Characteristic.Model, modelName)
            .setCharacteristic(Characteristic.SerialNumber, this.mac)
            .setCharacteristic(Characteristic.FirmwareRevision, PLUGIN_VERSION);

        this.enabledServices.push(informationService);
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
                this.logDebug('Input source changed, new input source identifier: %d, source appId: %s', inputIdentifier, this.inputAppIds[inputIdentifier]);
                this.setAppSwitchState(true, callback, this.inputAppIds[inputIdentifier]);
            });
        this.tvService
            .getCharacteristic(Characteristic.RemoteKey)
            .on('set', this.remoteKeyPress.bind(this));
        this.tvService
            .getCharacteristic(Characteristic.PowerModeSelection)
            .on('set', (newValue, callback) => {
                this.logDebug('Requested tv settings (PowerModeSelection): ' + newValue);
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
                this.logDebug('Volume change over the remote control (VolumeSelector), pressed: %s', state === 1 ? 'Down' : 'Up');
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

        this.inputAppIds = new Array();
        this.inputParams = {};
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

            if (value.name) {
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
                    .setCharacteristic(Characteristic.TargetVisibilityState, Characteristic.TargetVisibilityState.SHOWN)
                    .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

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
            let inputName = this.name + ' App - ' + appId;

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
                // store all input appIds
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
        this.channelNumbers = new Array();
        this.channelIds = new Array();
        this.channelButtons.forEach((value, i) => {

            // get channelNumber
            let channelNumber = null;

            if (value.channelNumber !== undefined) {
                channelNumber = value.channelNumber;
            } else {
                channelNumber = value;
            }

            // convert to string if the channel number was not a string
            channelNumber = channelNumber.toString();

            // get channelId
            let channelId = null;

            if (value.channelId !== undefined) {
                channelId = value.channelId;
            }

            // get name		
            let channelName = this.name + ' Channel - ' + channelNumber;

            if (value.channelName) {
                channelName = value.channelName;
            }

            // store all channel numbers
            this.channelNumbers.push(channelNumber);

            // store all channel ids
            this.channelIds[parseInt(channelNumber)] = channelId;

            let tmpChannel = new Service.Switch(channelName, 'channelButtonService' + i);
            tmpChannel
                .getCharacteristic(Characteristic.On)
                .on('get', (callback) => {
                    this.getChannelButtonState(callback, channelNumber);
                })
                .on('set', (state, callback) => {
                    this.setChannelButtonState(state, callback, channelNumber);
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

            // get the notification message
            let notificationMsg = null;

            if (value.message !== undefined) {
                notificationMsg = value.message;
            } else {
                notificationMsg = value;
            }

            // get name		
            let norificationName = this.name + ' Notification - ' + notificationMsg;

            if (value.name) {
                norificationName = value.name;
            }

            this.notificationButtons[i] = this.notificationButtons[i].toString();
            let tmpNotification = new Service.Switch(norificationName, 'notificationButtonService' + i);
            tmpNotification
                .getCharacteristic(Characteristic.On)
                .on('get', (callback) => {
                    this.getNotificationButtonState(callback);
                })
                .on('set', (state, callback) => {
                    this.setNotificationButtonState(state, callback, notificationMsg);
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
            let tmpRemoteControl = new Service.Switch(this.name + ' RC - ' + value, 'remoteControlButtonService' + i);
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
            let tmpSoundOutput = new Service.Switch(this.name + ' SO - ' + value, 'soundOutputButtonService' + i);
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
                    if (channelNumber === this.channelNumbers[i]) {
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
                this.logError('Wake on lan error');
                return;
            }
            let x = 0;
            let appLaunchInterval = setInterval(() => {
                if (this.connected) {
                    this.logDebug('Power on callback - connected to tv, running callback');
                    setTimeout(callback.bind(this), 1000);
                    clearInterval(appLaunchInterval);
                    return;
                }
                this.logDebug('Power on callback - trying to connect to tv...');
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
                this.logDebug('TV state: Off');
                this.disconnect();
                callback(null, false);
            } else if (isAlive && !this.connected) {
                this.lgtv.connect(this.url);
                this.logDebug('TV state: got response from TV, connecting...');
            }
        });
    }

    checkForegroundApp(callback, appId) {
        if (this.connected) {
            this.lgtv.request('ssap://com.webos.applicationManager/getForegroundAppInfo', (err, res) => {
                if (!res || err || res.errorCode || res.appId === '') {
                    this.logRequestError('Current app - error while getting current app info', err, res);
                    callback(null, false, null); // disable all switches
                } else {
                    this.logDebug('TV current appId: %s', res.appId);
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
                    this.logRequestError('Current channel - error while getting current channel info', err, res);
                    callback(null, false, null); // disable all switches
                } else {
                    this.logDebug('TV current channel: %s, %s, channelId: %s', res.channelNumber, res.channelName, res.channelId);
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
                    this.logRequestError('Sound output - error while getting current sound output', err, res);
                    callback(null, false, null); // disable all switches
                } else {
                    this.logDebug('TV current sound output: %s', res.soundOutput);
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
                channelNumber: channelNum,
                channelId: this.channelIds[parseInt(channelNum)]
            }, (err, res) => {
                if (!res || err || res.errorCode || !res.returnValue) {
                    this.logRequestError('Open channel - error while switching channel', err, res);
                } else {
                    this.logDebug('Open channel - channel switched successfully');
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
            this.logDebug('Power service - Trying to power on tv, sending magic packet');
            wol.wake(this.mac, {
                'address': this.broadcastAdr
            }, (error) => {
                if (error) {
                    this.logError('Wake on lan error');
                    return callback(new Error(`[${this.name}] Wake on lan error`));
                }
            })
            callback();
        } else {
            if (this.connected) {
                this.logDebug('Power service - TV turned off');
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
            this.logDebug('Volume service - TV %s', !state ? 'Muted' : 'Unmuted');
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
            // callback(new Error(`[${this.name}] Is not connected, cannot set mute state`));
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
            this.logDebug('Volume service - setting volume to %s, limit: %s', level, this.volumeLimit);
            if (level > this.volumeLimit) {
                level = this.volumeLimit;
            }
            this.lgtv.request('ssap://audio/setVolume', {
                volume: level
            });
            callback();
        } else {
            callback(new Error(`[${this.name}] TV is not connected, cannot set volume`));
        }
    }

    getVolumeSwitch(callback) {
        callback(null, false);
    }

    setVolumeSwitch(state, callback, isUp) {
        if (this.connected) {
            this.logDebug('Volume service - volume %s pressed, current volume: %s, limit: %s', isUp ? 'Up' : 'Down', this.tvVolume, this.volumeLimit);
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
            callback(new Error(`[${this.name}] Volume service - TV is not connected, cannot set volume`));
        }
    }

    getChannelSwitch(callback) {
        callback(null, false);
    }

    setChannelSwitch(state, callback, isUp) {
        if (this.connected) {
            this.logDebug('Channel service - channel %s pressed', isUp ? 'Up' : 'Down');
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
            callback(new Error(`[${this.name}] Channel service - TV is not connected, cannot change channel`));
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
                this.logDebug('App switch service - launching app with id %s', appId);
                if (this.inputParams[appId]) {
                    // launch with input params
                    this.logDebug('App switch service - params specified, adding params: %s', JSON.stringify(this.inputParams[appId]));
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
                this.logInfo('App switch service - Trying to launch %s but TV is off, attempting to power on the TV', appId);
                this.powerOnTvWithCallback(() => {
                    this.logDebug('App switch service - tv powered on, launching app with id: %s', appId);
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
            this.logDebug('Media control service - current media %s', action);
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
            callback(new Error(`[${this.name}] Media control service - is not connected, cannot control media`));
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
                if (this.tvCurrentAppId === WEBOS_LIVE_TV_APP_ID) { // it is only possible to switch channels when we are in the livetv app
                    this.logDebug('Channel button service - switching to channel number: %s, id: %s', channelNum, this.channelIds[parseInt(channelNum)]);
                    this.openChannel(channelNum);
                } else { // if we are not in the livetv app, then switch to the livetv app and set launchLiveTvChannel, after the app is switched the channel will be switched to the selected
                    this.logDebug('Channel button service - trying to switch to channel number: %s, id: %s, but the livetv app is not running, switching to livetv app', channelNum, this.channelIds[parseInt(channelNum)]);
                    this.launchLiveTvChannel = channelNum;
                    this.lgtv.request('ssap://system.launcher/launch', {
                        id: WEBOS_LIVE_TV_APP_ID
                    });
                }
                this.setChannelButtonManually(null, true, channelNum); // enable the selected channel switch and disable all other
                this.setAppSwitchManually(null, true, WEBOS_LIVE_TV_APP_ID); // disable all appswitches if active, except live tv
            } else { // prevent turning off the switch, since this is the current channel we should not turn off the switch
                setTimeout(() => {
                    this.setChannelButtonManually(null, true, channelNum);
                }, 10);
            }
            callback();
        } else {
            if (state) {
                this.logInfo('Channel button service - Trying to open channel number: %s, id: %s, but TV is off, attempting to power on the TV', channelNum, this.channelIds[parseInt(channelNum)]);
                this.powerOnTvWithCallback(() => {
                    this.logDebug('Channel button service - tv powered on, switching to channel number: %s, id: %s', channelNum, this.channelIds[parseInt(channelNum)]);
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
            this.logDebug('Notification button service - displaying notification with message: %s', notification);
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
            this.logDebug('Remote control button service - emulating remote control %s press', rcButton);
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
        this.logDebug('Remote key pressed: %d', remoteKey);

        switch (remoteKey) {
            case Characteristic.RemoteKey.REWIND:
                this.setRemoteControlButtonState(true, callback, 'REWIND');
                break;
            case Characteristic.RemoteKey.FAST_FORWARD:
                this.setRemoteControlButtonState(true, callback, 'FASTFORWARD');
                break;
            case Characteristic.RemoteKey.NEXT_TRACK:
                // does a endpoint call exist?
                this.logInfo('Next track remote key not supported');
                callback();
                break;
            case Characteristic.RemoteKey.PREVIOUS_TRACK:
                // does a endpoint call exist?
                this.logInfo('Previous track remote key not supported');
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
                        this.logRequestError('Sound output - error while changing sound output', err, res);
                    } else {
                        this.logDebug('Sound output - sound output changed successfully');
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
            callback(new Error(`[${this.name}] Sound output service - TV is not connected, cannot change channe`));
        }
    }

    getRemoteSequenceButtonState(callback) {
        callback(null, false);
    }

    setRemoteSequenceButtonState(state, callback, seqObj) {
        if (this.connected && this.pointerInputSocket) {
            this.logDebug('Remote sequence button service - emulating remote control sequence: %s with interval %s ms', seqObj.sequence.join(), seqObj.interval.join());
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

    logInfo(message, ...args) {
        this.log.info(`[${this.name}] ` + message, ...args);
    }

    logDebug(message, ...args) {
        this.log.debug(`[${this.name}] ` + message, ...args);
    }

    logError(message, ...args) {
        this.log.error(`[${this.name}] ` + message, ...args);
    }

    logRequestError(message, err, res) {
        this.logError(message);

        if (err) {
            this.logError('Error: %s', err);
        }

        if (res && res.errorText) {
            this.logError('Error message: %s', res.errorText);
        }
    }

    logRequestDebug(message, err, res) {
        this.logDebug(message);

        if (err) {
            this.logDebug('Error: %s', err);
        }

        if (res && res.errorText) {
            this.logDebug('Error message: %s', res.errorText);
        }
    }

}

// --== ACCESSORY STUFF  ==--

class webosTvAccessory extends webosTvDevice {
    constructor(log, config, api) {
        super(log, config, api);
        this.log.warn(`[${this.name}] WARNING - your tv is set up as an accessory, and this is not the preferred way anymore. Plase set up your tv in the config.json as a platform device. See the README on how to do that. Setting up the tv as an accessory will be removed in future release!`);
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
        this.log.info('Init - initializing devices');

        // read from config.devices
        if (this.config.devices && Array.isArray(this.config.devices)) {
            for (let device of this.config.devices) {
                if (device) {
                    new webosTvPlatformDevice(this.log, device, this.api);
                }
            }
        } else if (this.config.devices) {
            this.log.info('The devices property is not of type array. Cannot initialize. Type: %s', typeof this.config.devices);
        }

        // also read from config.tvs
        if (this.config.tvs && Array.isArray(this.config.tvs)) {
            for (let tv of this.config.tvs) {
                if (tv) {
                    new webosTvPlatformDevice(this.log, tv, this.api);
                }
            }
        } else if (this.config.tvs) {
            this.log.info('The tvs property is not of type array. Cannot initialize. Type: %s', typeof this.config.tvs);
        }

        if (!this.config.devices && !this.config.tvs) {
            this.log.info('-------------------------------------------');
            this.log.info('Init - no tv configuration found');
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


class webosTvPlatformDevice extends webosTvDevice {
    constructor(log, config, api) {
        super(log, config, api);

        this.log.info(`Init - initializing device with name: ${this.name}`);

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

