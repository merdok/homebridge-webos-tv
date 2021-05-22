const fs = require('fs');
const mkdirp = require('mkdirp');
const LgTvController = require('./lib/LgTvController.js');
const Events = require('./lib/Events.js');

let Service, Characteristic, Homebridge, Accessory;

const PLUGIN_NAME = 'homebridge-webos-tv';
const PLATFORM_NAME = 'webostv';
const PLUGIN_VERSION = '2.1.4';

// General constants
const NOT_EXISTING_INPUT = 999999;
const DEFAULT_INPUT_SOURCES_LIMIT = 45;
const BUTTON_RESET_TIMEOUT = 20; // in milliseconds
const AUTOMATIONS_TRIGGER_TIMEOUT = 400; // in milliseconds

module.exports = (homebridge) => {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  Homebridge = homebridge;
  Accessory = homebridge.platformAccessory;
  homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, webosTvPlatform, true);
};


class webosTvDevice {
  constructor(log, config, api) {
    this.log = log;
    this.api = api;

    // check if we have mandatory device info
    try {
      if (!config.ip) throw new Error(`TV ip address is required for ${config.name}`);
      if (!config.mac) throw new Error(`TV mac address is required for ${config.name}`);
    } catch (error) {
      this.logError(error);
      this.logError(`Failed to create platform device, missing mandatory information!`);
      this.logError(`Please check your device config!`);
      return;
    }


    // configuration
    this.name = config.name || 'webOS TV';
    this.ip = config.ip;
    this.mac = config.mac;
    this.broadcastAdr = config.broadcastAdr || '255.255.255.255';
    this.keyFile = config.keyFile;
    this.prefsDir = config.prefsDir || api.user.storagePath() + '/.webosTv/';
    this.alivePollingInterval = config.pollingInterval || 5;
    this.alivePollingInterval = this.alivePollingInterval * 1000;
    this.deepDebugLog = config.deepDebugLog;
    this.inputSourcesLimit = config.inputSourcesLimit || DEFAULT_INPUT_SOURCES_LIMIT;
    if (this.deepDebugLog === undefined) {
      this.deepDebugLog = false;
    }
    this.isHideTvService = config.hideTvService;
    if (this.isHideTvService === undefined) {
      this.isHideTvService = false;
    }
    this.volumeLimit = config.volumeLimit;
    if (this.volumeLimit === undefined || isNaN(this.volumeLimit) || this.volumeLimit < 0) {
      this.volumeLimit = 100;
    }
    this.volumeControl = config.volumeControl;
    if (this.volumeControl === undefined) {
      this.volumeControl = "both";
    }
    this.channelControl = config.channelControl;
    if (this.channelControl === undefined) {
      this.channelControl = true;
    }
    this.mediaControl = config.mediaControl;
    if (this.mediaControl === undefined) {
      this.mediaControl = false;
    }
    this.screenControl = config.screenControl;
    if (this.screenControl === undefined) {
      this.screenControl = false;
    }
    this.screenSaverControl = config.screenSaverControl;
    if (this.screenSaverControl === undefined) {
      this.screenSaverControl = false;
    }
    this.ccRemoteRemap = config.ccRemoteRemap;
    if (this.ccRemoteRemap === undefined) {
      this.ccRemoteRemap = {};
    }
    this.appButtons = config.appButtons;
    this.channelButtons = config.channelButtons;
    this.notificationButtons = config.notificationButtons;
    this.remoteControlButtons = config.remoteControlButtons;
    this.soundOutputButtons = config.soundOutputButtons;
    this.remoteSequenceButtons = config.remoteSequenceButtons;
    this.pictureModeButtons = config.pictureModeButtons;


    this.logInfo(`Init - got TV configuration, initializing device with name: ${this.name}`);


    // check if input sources limit is within a reasonable range
    if (this.inputSourcesLimit < 10) {
      this.inputSourcesLimit = 10;
    }
    if (this.inputSourcesLimit > 65) {
      this.inputSourcesLimit = 65;
    }

    // check if prefs directory ends with a /, if not then add it
    if (this.prefsDir.endsWith('/') === false) {
      this.prefsDir = this.prefsDir + '/';
    }

    // check if the tv preferences directory exists, if not then create it
    if (fs.existsSync(this.prefsDir) === false) {
      mkdirp(this.prefsDir);
    }

    // generate the key file name for the TV if not specified
    if (this.keyFile === undefined) {
      this.keyFile = this.prefsDir + 'keyFile_' + this.ip.split('.').join('') + '_' + this.mac.split(':').join('');
    }

    // prepare file paths
    this.tvInfoFile = this.prefsDir + 'info_' + this.mac.split(':').join('');
    this.tvAvailableInputsFile = this.prefsDir + 'inputsAvailable_' + this.mac.split(':').join('');
    this.tvInputConfigFile = this.prefsDir + 'inputsConfg_' + this.mac.split(':').join('');

    //prepare variables
    this.dummyInputSourceServices = [];
    this.configuredInputs = {};
    this.tvInputsConfig = {};

    // connect to the TV
    this.connectToTv();

    // init the tv accessory
    this.initTvAccessory();

  }

  /*----------========== SETUP TV DEVICE ==========----------*/

  connectToTv() {
    // create new tv instance and try to connect
    this.lgTvCtrl = new LgTvController(this.ip, this.mac, this.name, this.keyFile, this.broadcastAdr, this.alivePollingInterval, this.log);
    this.lgTvCtrl.setVolumeLimit(this.volumeLimit);
    this.lgTvCtrl.setDeepDebugLogEnabled(this.deepDebugLog);
    this.lgTvCtrl.connect();


    //register to listeners
    this.lgTvCtrl.on(Events.SETUP_FINISHED, () => {
      this.logInfo('TV setup finished, ready to control tv');

      // add external inputs
      this.initInputSources();

      //  remove the information service here and add the new one after setup is complete, this way i do not have to save anything?
      this.updateInformationService();
    });

    this.lgTvCtrl.on(Events.TV_TURNED_ON, () => {
      this.updateTvStatusFull();
    });

    this.lgTvCtrl.on(Events.TV_TURNED_OFF, () => {
      this.updateTvStatusFull();
    });

    this.lgTvCtrl.on(Events.PIXEL_REFRESHER_STARTED, () => {
      this.updateTvStatusFull();
    });

    this.lgTvCtrl.on(Events.SCREEN_SAVER_TURNED_ON, () => {
      this.updateScreenSaverStatus();
    });

    this.lgTvCtrl.on(Events.POWER_STATE_CHANGED, () => {
      this.updatePowerStatus();
      this.updateScreenStatus();
      this.updateScreenSaverStatus();
    });

    this.lgTvCtrl.on(Events.FOREGROUND_APP_CHANGED, (res) => {
      this.updateActiveInputSource();
      this.updateAppButtons();
      this.updateChannelButtons();
    });

    this.lgTvCtrl.on(Events.AUDIO_STATUS_CHANGED, () => {
      this.updateTvAudioStatus();
    });

    this.lgTvCtrl.on(Events.LIVE_TV_CHANNEL_CHANGED, () => {
      this.updateChannelButtons();
    });

    this.lgTvCtrl.on(Events.SOUND_OUTPUT_CHANGED, () => {
      this.updateSoundOutputButtons();
    });

    this.lgTvCtrl.on(Events.NEW_APP_ADDED, (res) => {
      if (res) {
        this.newAppInstalledOnTv(res);
      }
    });

    this.lgTvCtrl.on(Events.APP_REMOVED, (res) => {
      if (res) {
        this.appRemovedFromTv(res.appId);
      }
    });

    this.lgTvCtrl.on(Events.VOLUME_UP, () => {
      this.triggerVolumeUpAutomations();
    });

    this.lgTvCtrl.on(Events.VOLUME_DOWN, (res) => {
      this.triggerVolumeDownAutomations();
    });

  }

  /*----------========== SETUP SERVICES ==========----------*/

  initTvAccessory() {
    // generate uuid
    this.UUID = Homebridge.hap.uuid.generate(this.mac + this.ip);

    // prepare the tv accessory
    this.tvAccesory = new Accessory(this.name, this.UUID, Homebridge.hap.Accessory.Categories.TELEVISION);

    // prepare accessory services
    this.setupAccessoryServices();

    this.api.publishExternalAccessories(PLUGIN_NAME, [this.tvAccesory]);
  }

  setupAccessoryServices() {

    // update the services
    this.updateInformationService();

    // prepare the tv service
    if (this.isHideTvService === false) {
      this.prepareTvService();
    }

    // additional services
    this.prepareVolumeService();
    this.prepareChannelControlService();
    this.prepareMediaControlService();
    this.prepareScreenControlService();
    this.prepareScreenSaverControlService();
    this.prepareAppButtonService();
    this.prepareChannelButtonService();
    this.prepareNotificationButtonService();
    this.prepareRemoteControlButtonService();
    this.prepareSoundOutputButtonService();
    this.prepareRemoteSequenceButtonsService();
    this.preparePictureModeButtonService();
  }

  //
  // tv information service ----------------------------------------------------------------
  updateInformationService() {

    let modelName = this.lgTvCtrl.getTvSystemInfo() ? this.lgTvCtrl.getTvSystemInfo().modelName : 'Unknown';
    let productName = this.lgTvCtrl.getTvSwInfo() ? `${this.lgTvCtrl.getTvSwInfo().product_name} (${PLUGIN_VERSION})` : PLUGIN_VERSION;
    let tvFirmwareVer = this.lgTvCtrl.getTvSwInfo() ? this.lgTvCtrl.getTvSwInfo().major_ver + '.' + this.lgTvCtrl.getTvSwInfo().minor_ver : 'Unknown';

    // remove the preconstructed information service, since i will be adding my own
    this.tvAccesory.removeService(this.tvAccesory.getService(Service.AccessoryInformation));

    // add my own information service
    let informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Manufacturer, 'LG Electronics')
      .setCharacteristic(Characteristic.Model, modelName)
      .setCharacteristic(Characteristic.SerialNumber, productName)
      .setCharacteristic(Characteristic.FirmwareRevision, tvFirmwareVer);

    this.tvAccesory.addService(informationService);
  }



  // native tv services ----------------------------------------------------------------
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

    this.tvService
      .setCharacteristic(Characteristic.ActiveIdentifier, NOT_EXISTING_INPUT); // do not preselect any inputs since there are no default inputs
    this.tvService
      .getCharacteristic(Characteristic.ActiveIdentifier)
      .on('set', (inputIdentifier, callback) => {
        this.logDebug('Input source changed, new input source identifier: %d, source appId: %s', inputIdentifier, this.configuredInputs[inputIdentifier].appId);
        if (this.configuredInputs[inputIdentifier]) {
          this.lgTvCtrl.turnOnTvAndLaunchApp(this.configuredInputs[inputIdentifier].appId, this.configuredInputs[inputIdentifier].params);
        }
        callback();
      })
      .on('get', (callback) => {
        callback(null, this.getActiveInputId());
      });

    this.tvService
      .getCharacteristic(Characteristic.RemoteKey)
      .on('set', this.remoteKeyPress.bind(this));

    this.tvService
      .getCharacteristic(Characteristic.PowerModeSelection)
      .on('set', (newValue, callback) => {
        this.logDebug('Requested tv settings (PowerModeSelection): ' + newValue);
        this.lgTvCtrl.sendRemoteInputSocketCommand('MENU');
        callback();
      });


    // not supported yet??
    /*
    this.tvService
      .getCharacteristic(Characteristic.PictureMode)
      .on('set', function(newValue, callback) {
    	console.log('set PictureMode => setNewValue: ' + newValue);
    	callback(null);
      });
      */


    this.tvAccesory.addService(this.tvService);

    // prepare the additional native services - control center tv speaker and inputs
    this.prepareTvSpeakerService();
    this.prepareInputSourcesService();
  }

  prepareTvSpeakerService() {
    this.tvSpeakerService = new Service.TelevisionSpeaker(this.name + ' Volume', 'tvSpeakerService');
    this.tvSpeakerService
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
    this.tvSpeakerService
      .getCharacteristic(Characteristic.VolumeSelector)
      .on('set', (state, callback) => {
        this.logDebug('Volume change over the remote control (VolumeSelector), pressed: %s', state === Characteristic.VolumeSelector.DECREMENT ? 'Down' : 'Up');
        if (state === Characteristic.VolumeSelector.DECREMENT) {
          this.setVolumeDown(true, callback);
        } else {
          this.setVolumeUp(true, callback);
        }
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
    this.tvAccesory.addService(this.tvSpeakerService);
  }

  prepareInputSourcesService() {
    // create dummy inputs
    for (var i = 0; i < this.inputSourcesLimit; i++) {

      let inputId = i;

      let dummyInputSource = new Service.InputSource('dummy', `input_${inputId}`);
      dummyInputSource
        .setCharacteristic(Characteristic.Identifier, inputId)
        .setCharacteristic(Characteristic.ConfiguredName, 'dummy')
        .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.NOT_CONFIGURED)
        .setCharacteristic(Characteristic.TargetVisibilityState, Characteristic.TargetVisibilityState.HIDDEN)
        .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.HIDDEN);

      // add the new dummy input source service to the tv accessory
      this.tvService.addLinkedService(dummyInputSource);
      this.tvAccesory.addService(dummyInputSource);

      // keep references to all free dummy input services
      this.dummyInputSourceServices.push(dummyInputSource);

    }

    // read out the saved tv inputs
    let availableInputs = [];
    try {
      availableInputs = JSON.parse(fs.readFileSync(this.tvAvailableInputsFile));
    } catch (err) {
      this.logDebug('The TV has no configured inputs yet!');
    }

    // read out the tv input sources config
    try {
      this.tvInputsConfig = JSON.parse(fs.readFileSync(this.tvInputConfigFile));
    } catch (err) {
      this.logDebug('No TV inputs config file found!');
    }

    // add the saved inputs
    //Note to myself, i am saving the inputs in a file as a cache in order when the user starts homebridge and the tv is off that the cached inputs got added already.
    this.addInputSources(availableInputs);
  }

  addInputSources(inputSourcesList) {
    // if the tv service is hidden then we cannot add any input sources so just skip
    if (this.isHideTvService) {
      return;
    }

    // make sure we always have an array here
    if (!inputSourcesList || Array.isArray(inputSourcesList) === false) {
      inputSourcesList = [];
    }

    this.logDebug(`Adding ${inputSourcesList.length} new input sources!`);

    for (let value of inputSourcesList) {

      if (this.dummyInputSourceServices.length === 0) {
        this.logWarn(`Inputs limit (${this.inputSourcesLimit}) reached. Cannot add any more new inputs!`);
        break;
      }

      var inputSourceService = this.dummyInputSourceServices.shift(); // get the first free input source service

      // create a new input definition
      let newInputDef = {};

      // get appId
      newInputDef.appId = value.appId;

      // if appId null or empty then skip this input, appId is required to open an app
      if (!newInputDef.appId || newInputDef.appId === '' || typeof newInputDef.appId !== 'string') {
        this.logWarn(`Missing appId or appId is not of type string. Cannot add input source!`);
        return;
      }

      // remove all white spaces from the appId string
      newInputDef.appId = newInputDef.appId.replace(/\s/g, '');

      //appId
      newInputDef.appId = newInputDef.appId;

      // name (name - input config, label - auto generated inputs)
      newInputDef.name = value.name || value.label || newInputDef.appId;

      // if we have a saved name in the input sources config then use that
      if (this.tvInputsConfig[newInputDef.appId] && this.tvInputsConfig[newInputDef.appId].name) {
        newInputDef.name = this.tvInputsConfig[newInputDef.appId].name;
      }

      // params
      newInputDef.params = value.params || {};

      //input Identifier
      newInputDef.id = inputSourceService.getCharacteristic(Characteristic.Identifier).value;

      let visible = false;
      if (this.tvInputsConfig[newInputDef.appId] && this.tvInputsConfig[newInputDef.appId].visible === true) {
        visible = true;
      }

      inputSourceService
        .setCharacteristic(Characteristic.Name, newInputDef.name)
        .setCharacteristic(Characteristic.ConfiguredName, newInputDef.name)
        .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION)
        .setCharacteristic(Characteristic.TargetVisibilityState, visible ? Characteristic.TargetVisibilityState.SHOWN : Characteristic.TargetVisibilityState.HIDDEN)
        .setCharacteristic(Characteristic.CurrentVisibilityState, visible ? Characteristic.CurrentVisibilityState.SHOWN : Characteristic.CurrentVisibilityState.HIDDEN);

      // set visibility state
      inputSourceService.getCharacteristic(Characteristic.TargetVisibilityState)
        .on('set', (state, callback) => {
          this.setInputTargetVisibility(state, newInputDef);
          callback();
        });

      // set input name
      inputSourceService.getCharacteristic(Characteristic.ConfiguredName)
        .on('set', (value, callback) => {
          this.setInputConfiguredName(value, newInputDef);
          callback();
        });

      // add a reference to the input source to the new input and add it to the configured inputs list
      newInputDef.inputService = inputSourceService;
      this.configuredInputs[newInputDef.id] = newInputDef;

      this.logDebug(`Created new input source: appId: ${newInputDef.appId}, name: ${newInputDef.name}`);

    }

  }

  removeInputSource(inputDef) {
    // removed it from configured inptuts
    delete this.configuredInputs[inputDef.id];

    // reset dummy info
    let inputService = inputDef.inputService;
    inputService
      .setCharacteristic(Characteristic.Name, 'dummy')
      .setCharacteristic(Characteristic.ConfiguredName, 'dummy')
      .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.NOT_CONFIGURED)
      .setCharacteristic(Characteristic.TargetVisibilityState, Characteristic.TargetVisibilityState.HIDDEN)
      .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.HIDDEN);

    // readd to the dummy list as free
    this.dummyInputSourceServices.push(inputService);

  }



  // additional services ----------------------------------------------------------------
  prepareVolumeService() {
    if (!this.volumeControl || this.volumeControl === "none") {
      return;
    }

    // slider/lightbulb
    if (this.volumeControl === true || this.volumeControl === "both" || this.volumeControl === 'slider') {
      this.volumeAsLightbulbService = new Service.Lightbulb(this.name + ' Volume', 'volumeService');
      this.volumeAsLightbulbService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getLightbulbMuteState.bind(this))
        .on('set', this.setLightbulbMuteState.bind(this));
      this.volumeAsLightbulbService
        .addCharacteristic(new Characteristic.Brightness())
        .on('get', this.getLightbulbVolume.bind(this))
        .on('set', this.setLightbulbVolume.bind(this));

      this.tvAccesory.addService(this.volumeAsLightbulbService);
    }

    // volume up/down buttons
    if (this.volumeControl === true || this.volumeControl === "both" || this.volumeControl === 'buttons') {

      this.volumeUpService = this.createStatlessSwitchService(this.name + ' Volume Up', 'volumeUpService', this.setVolumeUp.bind(this));
      this.tvAccesory.addService(this.volumeUpService);

      this.volumeDownService = this.createStatlessSwitchService(this.name + ' Volume Down', 'volumeDownService', this.setVolumeDown.bind(this));
      this.tvAccesory.addService(this.volumeDownService);
    }
  }


  prepareChannelControlService() {
    if (!this.channelControl) {
      return;
    }

    this.channelUpService = this.createStatlessSwitchService(this.name + ' Channel Up', 'channelUpService', this.setChannelUp.bind(this));
    this.tvAccesory.addService(this.channelUpService);

    this.channelDownService = this.createStatlessSwitchService(this.name + ' Channel Down', 'channelDownService', this.setChannelDown.bind(this));
    this.tvAccesory.addService(this.channelDownService);
  }


  prepareMediaControlService() {
    if (!this.mediaControl) {
      return;
    }

    this.mediaPlayService = this.createStatlessSwitchService(this.name + ' Play', 'mediaPlayService', this.setPlay.bind(this));
    this.tvAccesory.addService(this.mediaPlayService);

    this.mediaPauseService = this.createStatlessSwitchService(this.name + ' Pause', 'mediaPauseService', this.setPause.bind(this));
    this.tvAccesory.addService(this.mediaPauseService);

    this.mediaStopService = this.createStatlessSwitchService(this.name + ' Stop', 'mediaStopService', this.setStop.bind(this));
    this.tvAccesory.addService(this.mediaStopService);

    this.mediaRewindService = this.createStatlessSwitchService(this.name + ' Rewind', 'mediaRewindService', this.setRewind.bind(this));
    this.tvAccesory.addService(this.mediaRewindService);

    this.mediaFastForwardService = this.createStatlessSwitchService(this.name + ' Fast Forward', 'mediaFastForwardService', this.setFastForward.bind(this));
    this.tvAccesory.addService(this.mediaFastForwardService);
  }

  prepareScreenControlService() {
    if (!this.screenControl) {
      return;
    }

    // create the service
    this.screenControlService = new Service.Switch(this.name + ' Screen', 'screenControlService');
    this.screenControlService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getTvScreenState.bind(this))
      .on('set', this.setTvScreenState.bind(this));

    this.tvAccesory.addService(this.screenControlService);
  }

  prepareScreenSaverControlService() {
    if (!this.screenSaverControl) {
      return;
    }

    // create the service
    this.screenSaverControlService = new Service.Switch(this.name + ' Screen Saver', 'screenSaverControlService');
    this.screenSaverControlService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getScreenSaverState.bind(this))
      .on('set', this.setScreenSaverState.bind(this));

    this.tvAccesory.addService(this.screenSaverControlService);
  }

  prepareAppButtonService() {
    if (this.checkArrayConfigProperty(this.appButtons, "appButtons") === false) {
      return;
    }

    this.configuredAppButtons = {};

    this.appButtons.forEach((value, i) => {

      // create a new app button definition
      let newAppButtonDef = {};

      // get appid
      newAppButtonDef.appId = value.appId || value;

      // if appId null or empty then skip this app button, appId is required to open an app
      if (!newAppButtonDef.appId || newAppButtonDef.appId === '' || typeof newAppButtonDef.appId !== 'string') {
        this.logWarn(`Missing appId or appId in not of type string. Cannot add app button!`);
        return;
      }

      // remove all white spaces from the appId string
      newAppButtonDef.appId = newAppButtonDef.appId.replace(/\s/g, '');

      // get name
      newAppButtonDef.name = value.name || this.name + ' App - ' + newAppButtonDef.appId;

      // params
      newAppButtonDef.params = value.params || {};

      // create the service
      let newAppButtonService = new Service.Switch(newAppButtonDef.name, 'appButtonService' + i);
      newAppButtonService
        .getCharacteristic(Characteristic.On)
        .on('get', (callback) => {
          this.getAppButtonState(callback, newAppButtonDef.appId);
        })
        .on('set', (state, callback) => {
          this.setAppButtonState(state, callback, newAppButtonDef);
        });

      this.tvAccesory.addService(newAppButtonService);

      // save the configured channel button service
      newAppButtonDef.buttonService = newAppButtonService;

      this.configuredAppButtons[newAppButtonDef.appId + i] = newAppButtonDef; // need to add i here to the appid since a user can configure multiple appbuttons with the same appid

    });
  }

  prepareChannelButtonService() {
    if (this.checkArrayConfigProperty(this.channelButtons, "channelButtons") === false) {
      return;
    }

    this.configuredChannelButtons = {};

    this.channelButtons.forEach((value, i) => {

      // create a new channel button definition
      let newChannelButtonDef = {};

      // get the channelNumber
      newChannelButtonDef.channelNumber = value.channelNumber || value;

      // if channelNumber null or is not a number then skip this channel button, channelNumber is required
      if (Number.isInteger(parseInt(newChannelButtonDef.channelNumber)) === false) {
        this.logWarn(`Missing channelNumber or channelNumber is not a number. Cannot add channel button!`);
        return;
      }

      // convert to string if the channel number was not a string
      newChannelButtonDef.channelNumber = newChannelButtonDef.channelNumber.toString();

      // get channelId
      newChannelButtonDef.channelId = value.channelId;

      // get name
      newChannelButtonDef.name = value.name || this.name + ' Channel - ' + newChannelButtonDef.channelNumber;

      // create the service
      let newChannelButtonService = new Service.Switch(newChannelButtonDef.name, 'channelButtonService' + i);
      newChannelButtonService
        .getCharacteristic(Characteristic.On)
        .on('get', (callback) => {
          this.getChannelButtonState(callback, newChannelButtonDef.channelNumber);
        })
        .on('set', (state, callback) => {
          this.setChannelButtonState(state, callback, newChannelButtonDef);
        });

      // add to the tv service
      this.tvAccesory.addService(newChannelButtonService);

      // save the configured channel button service
      newChannelButtonDef.buttonService = newChannelButtonService;

      this.configuredChannelButtons[newChannelButtonDef.channelNumber] = newChannelButtonDef;

    });
  }


  prepareNotificationButtonService() {
    if (this.checkArrayConfigProperty(this.notificationButtons, "notificationButtons") === false) {
      return;
    }

    this.configuredNotificationButtons = [];

    this.notificationButtons.forEach((value, i) => {

      // create a new notification button definition
      let newNotificationButtonDef = {};

      // get the notification message
      newNotificationButtonDef.message = value.message || value;

      // if message null or empty then skip this notification button, message is required to display a notification
      if (!newNotificationButtonDef.message || typeof newNotificationButtonDef.message !== 'string' || newNotificationButtonDef.message === '') {
        this.logWarn(`Missing message or message is not of type string. Cannot add notification button!`);
        return;
      }

      // get name
      newNotificationButtonDef.name = value.name || this.name + ' Notification - ' + newNotificationButtonDef.message;

      // get the appId if specified
      newNotificationButtonDef.appId = value.appId;

      // params
      newNotificationButtonDef.params = value.params || {};

      // get the optional notification content file, if that is specified then the content of this file is read and displayed in the notification
      if (value.file && typeof value.file === 'string' && value.file.length > 0) {
        newNotificationButtonDef.file = value.file;
        // if only file name specified then look for the file in the prefsdir
        if (newNotificationButtonDef.file.includes('/') === false) {
          newNotificationButtonDef.file = this.prefsDir + newNotificationButtonDef.file;
        }
      }

      // create the stateless button service
      let newNotificationButtonService = this.createStatlessSwitchService(newNotificationButtonDef.name, 'notificationButtonService' + i, (state, callback) => {
        this.setNotificationButtonState(state, callback, newNotificationButtonDef);
      });

      this.tvAccesory.addService(newNotificationButtonService);

      // save the configured notification button service
      newNotificationButtonDef.buttonService = newNotificationButtonService;

      this.configuredNotificationButtons.push(newNotificationButtonDef);
    });
  }


  prepareRemoteControlButtonService() {
    if (this.checkArrayConfigProperty(this.remoteControlButtons, "remoteControlButtons") === false) {
      return;
    }

    this.configuredRemoteControlButtons = [];

    this.remoteControlButtons.forEach((value, i) => {

      // create a new remote control button definition
      let newRemoteControlButtonDef = {};

      // get the remote control action
      newRemoteControlButtonDef.action = value.action || value;

      // if action null or empty then skip this remote control button, action is required for a remote control button
      if (!newRemoteControlButtonDef.action || newRemoteControlButtonDef.action === '' || typeof newRemoteControlButtonDef.action !== 'string') {
        this.logWarn(`Missing action or action is not of type string. Cannot add remote control button!`);
        return;
      }

      // make sure the action is string and uppercase
      newRemoteControlButtonDef.action = newRemoteControlButtonDef.action.toString().toUpperCase();

      // get name
      newRemoteControlButtonDef.name = value.name || this.name + ' RC - ' + newRemoteControlButtonDef.action;

      // create the stateless button service
      let newRemoteControlButtonService = this.createStatlessSwitchService(newRemoteControlButtonDef.name, 'remoteControlButtonService' + i, (state, callback) => {
        this.setRemoteControlButtonState(state, callback, newRemoteControlButtonDef.action);
      });

      this.tvAccesory.addService(newRemoteControlButtonService);

      // save the configured remote control button service
      newRemoteControlButtonDef.buttonService = newRemoteControlButtonService;

      this.configuredRemoteControlButtons.push(newRemoteControlButtonDef);
    });
  }


  prepareSoundOutputButtonService() {
    if (this.checkArrayConfigProperty(this.soundOutputButtons, "soundOutputButtons") === false) {
      return;
    }

    this.configuredSoundOutputButtons = {};

    this.soundOutputButtons.forEach((value, i) => {

      // create a new sound output button definition
      let newSoundOutputButtonDef = {};

      // get the sound output id
      newSoundOutputButtonDef.soundOutput = value.soundOutput || value;

      // if soundOutput null or empty then skip this sound output button, soundOutput is required for a sound output button
      if (!newSoundOutputButtonDef.soundOutput || newSoundOutputButtonDef.soundOutput === '' || typeof newSoundOutputButtonDef.soundOutput !== 'string') {
        this.logWarn(`Missing soundOutput or soundOutput is not of type string. Cannot add sound output button!`);
        return;
      }

      // make sure the soundOutput is string
      newSoundOutputButtonDef.soundOutput = newSoundOutputButtonDef.soundOutput.toString();

      // get name
      newSoundOutputButtonDef.name = value.name || this.name + ' SO - ' + newSoundOutputButtonDef.soundOutput;

      // create the service
      let newSoundOutputButtonService = new Service.Switch(newSoundOutputButtonDef.name, 'soundOutputButtonService' + i);
      newSoundOutputButtonService
        .getCharacteristic(Characteristic.On)
        .on('get', (callback) => {
          this.getSoundOutputButtonState(callback, newSoundOutputButtonDef.soundOutput);
        })
        .on('set', (state, callback) => {
          this.setSoundOutputButtonState(state, callback, newSoundOutputButtonDef.soundOutput);
        });

      this.tvAccesory.addService(newSoundOutputButtonService);

      // save the configured sound output button service
      newSoundOutputButtonDef.buttonService = newSoundOutputButtonService;

      this.configuredSoundOutputButtons[newSoundOutputButtonDef.soundOutput] = newSoundOutputButtonDef;

    });
  }


  preparePictureModeButtonService() {
    if (this.checkArrayConfigProperty(this.pictureModeButtons, "pictureModeButtons") === false) {
      return;
    }

    this.configuredPictureModeButtons = [];

    this.pictureModeButtons.forEach((value, i) => {

      // create a new picture mode button definition
      let newPictureModeButtonDef = {};

      // get the picture mode name
      newPictureModeButtonDef.pictureMode = value.pictureMode || value;

      // if pictureMode null or empty then skip this picture mode button, pictureMode is required for a picture mode button
      if (!newPictureModeButtonDef.pictureMode || newPictureModeButtonDef.pictureMode === '' || typeof newPictureModeButtonDef.pictureMode !== 'string') {
        this.logWarn(`Missing pictureMode or pictureMode is not of type string. Cannot add picture mode button!`);
        return;
      }

      // make sure the pictureMode is string
      newPictureModeButtonDef.pictureMode = newSoundOutputButtonDef.pictureMode.toString();

      // get name
      newPictureModeButtonDef.name = value.name || 'Picture Mode - ' + newPictureModeButtonDef.pictureMode;

      // create the stateless button service
      let newPictureModeButtonService = this.createStatlessSwitchService(newPictureModeButtonDef.name, 'pictureModeButtonsService' + i, (state, callback) => {
        this.setPictureModeButtonState(state, callback, newPictureModeButtonDef.pictureMode);
      });

      this.tvAccesory.addService(newPictureModeButtonService);

      // save the configured sound output button service
      newPictureModeButtonDef.buttonService = newPictureModeButtonService;

      this.configuredRemoteSequenceButtons.push(newPictureModeButtonDef);

    });
  }


  prepareRemoteSequenceButtonsService() {
    if (this.checkArrayConfigProperty(this.remoteSequenceButtons, "remoteSequenceButtons") === false) {
      return;
    }

    this.configuredRemoteSequenceButtons = [];

    this.remoteSequenceButtons.forEach((value, i) => {

      // create a new remote sequence button definition
      let newRemoteSequenceButtonDef = {};

      // get the sequence
      newRemoteSequenceButtonDef.sequence = value.sequence || value;

      // check if everything is fine
      if (newRemoteSequenceButtonDef.sequence === null || newRemoteSequenceButtonDef.sequence === undefined || Array.isArray(newRemoteSequenceButtonDef.sequence) === false) {
        this.logWarn(`Missing sequence defintion. Cannot add remote sequence button!`);
        return;
      }

      // get sequence name
      newRemoteSequenceButtonDef.name = value.name || this.name + ' Sequence ' + i;

      // get/adjust sequence interval
      newRemoteSequenceButtonDef.interval = [500]; // default value
      if (value.interval) {
        if (Array.isArray(value.interval) === false) {
          if (isNaN(value.interval) === false) {
            //single value
            newRemoteSequenceButtonDef.interval = [parseInt(value.interval)];
          }
        } else {
          // list of intervals
          newRemoteSequenceButtonDef.interval = value.interval;
        }
      }

      // create the stateless button service
      let newRemoteSequenceButtonService = this.createStatlessSwitchService(newRemoteSequenceButtonDef.name, 'remoteSequenceButtonsService' + i, (state, callback) => {
        this.setRemoteSequenceButtonState(state, callback, newRemoteSequenceButtonDef);
      });

      this.tvAccesory.addService(newRemoteSequenceButtonService);

      // save the configured remote sequence button service
      newRemoteSequenceButtonDef.buttonService = newRemoteSequenceButtonService;

      this.configuredRemoteSequenceButtons.push(newRemoteSequenceButtonDef);

    });
  }


  /*----------========== HOMEBRIDGE STATE SETTERS/GETTERS ==========----------*/

  /*---=== Tv service ===---*/

  // Power
  getPowerState(callback) {
    let isTvOn = false;
    if (this.lgTvCtrl) {
      isTvOn = this.lgTvCtrl.isTvOn();
    }
    callback(null, isTvOn);
  }

  setPowerState(state, callback) {
    if (this.lgTvCtrl) {
      let isPowerOn = state === Characteristic.Active.ACTIVE;
      this.lgTvCtrl.setTvPowerState(isPowerOn);
      callback();
    } else {
      callback(this.createError(`cannot set power state`));
    }
  }

  // Mute
  getMuteState(callback) {
    let isTvMuted = true;
    if (this.lgTvCtrl.isTvOn()) {
      isTvMuted = this.lgTvCtrl.isMuted();
    }
    callback(null, isTvMuted);
  }

  setMuteState(state, callback) {
    if (this.lgTvCtrl.isTvOn()) {
      this.lgTvCtrl.setMute(state);
    }
    callback();
  }

  // volume level
  getVolume(callback) {
    let tvVolume = 0;
    if (this.lgTvCtrl.isTvOn()) {
      tvVolume = this.lgTvCtrl.getVolumeLevel();
    }
    callback(null, tvVolume);
  }

  setVolume(level, callback) {
    if (this.lgTvCtrl.isTvOn()) {
      this.lgTvCtrl.setVolumeLevel(level);
    }
    callback();
  }

  // cc remote control
  remoteKeyPress(remoteKey, callback) {
    switch (remoteKey) {
      case Characteristic.RemoteKey.REWIND:
        this.lgTvCtrl.sendRemoteInputSocketCommand('REWIND');
        break;
      case Characteristic.RemoteKey.FAST_FORWARD:
        this.lgTvCtrl.sendRemoteInputSocketCommand('FASTFORWARD');
        break;
      case Characteristic.RemoteKey.NEXT_TRACK:
        this.logDebug('Next track remote key not supported');
        callback();
        break;
      case Characteristic.RemoteKey.PREVIOUS_TRACK:
        this.logDebug('Previous track remote key not supported');
        callback();
        break;
      case Characteristic.RemoteKey.ARROW_UP:
        this.lgTvCtrl.sendRemoteInputSocketCommand(this.ccRemoteRemap.arrowup || 'UP');
        break;
      case Characteristic.RemoteKey.ARROW_DOWN:
        this.lgTvCtrl.sendRemoteInputSocketCommand(this.ccRemoteRemap.arrowdown || 'DOWN');
        break;
      case Characteristic.RemoteKey.ARROW_LEFT:
        this.lgTvCtrl.sendRemoteInputSocketCommand(this.ccRemoteRemap.arrowleft || 'LEFT');
        break;
      case Characteristic.RemoteKey.ARROW_RIGHT:
        this.lgTvCtrl.sendRemoteInputSocketCommand(this.ccRemoteRemap.arrowright || 'RIGHT');
        break;
      case Characteristic.RemoteKey.SELECT:
        this.lgTvCtrl.sendRemoteInputSocketCommand(this.ccRemoteRemap.select || 'ENTER');
        break;
      case Characteristic.RemoteKey.BACK:
        this.lgTvCtrl.sendRemoteInputSocketCommand(this.ccRemoteRemap.back || 'BACK');
        break;
      case Characteristic.RemoteKey.EXIT:
        this.lgTvCtrl.sendRemoteInputSocketCommand('EXIT');
        break;
      case Characteristic.RemoteKey.PLAY_PAUSE:
        if (this.ccRemoteRemap.playpause) {
          this.lgTvCtrl.sendRemoteInputSocketCommand(this.ccRemoteRemap.playpause);
        } else {
          this.lgTvCtrl.sendPlayPause();
        }
        break;
      case Characteristic.RemoteKey.INFORMATION:
        this.lgTvCtrl.sendRemoteInputSocketCommand(this.ccRemoteRemap.information || 'INFO');
        break;
    }

    callback();
  }

  //inputs config
  setInputTargetVisibility(state, inputDef) {
    if (this.configuredInputs[inputDef.id]) {
      let isVisible = state === Characteristic.TargetVisibilityState.SHOWN ? true : false;
      this.logDebug(`Setting ${isVisible ? 'VISIBLE' : 'HIDDEN' } for input with name: ${inputDef.name}  id: ${inputDef.id}`);
      let newVisibilityState = isVisible ? Characteristic.CurrentVisibilityState.SHOWN : Characteristic.CurrentVisibilityState.HIDDEN;
      // update the characteristic
      this.configuredInputs[inputDef.id].inputService.getCharacteristic(Characteristic.CurrentVisibilityState).updateValue(newVisibilityState);
      // save the visible state in the config file
      this.updateVisibilityInputConfigForAppId(inputDef.appId, isVisible);
    }
  }

  setInputConfiguredName(value, inputDef) {
    if (this.configuredInputs[inputDef.id]) {
      this.logDebug(`Changing input name from ${inputDef.name} to ${value} for input with id: ${inputDef.id}`);
      // update the characteristic
      this.configuredInputs[inputDef.id].inputService.getCharacteristic(Characteristic.ConfiguredName).updateValue(value);
      // save the new name to the file
      this.updateNameInputConfigForAppId(inputDef.appId, value);
    }
  }


  /*---=== Custom services ===---*/

  /*--== Stateless ==--*/

  // volume up/down switches
  setVolumeUp(state, callback) {
    if (this.lgTvCtrl.isTvOn()) {
      this.lgTvCtrl.volumeUp();
    }
    this.resetVolumeControlButtons();
    callback();
  }

  setVolumeDown(state, callback) {
    if (this.lgTvCtrl.isTvOn()) {
      this.lgTvCtrl.volumeDown();
    }
    this.resetVolumeControlButtons();
    callback();
  }

  // channel up /down switches
  setChannelUp(state, callback) {
    if (this.lgTvCtrl.isTvOn()) {
      this.lgTvCtrl.channelUp();
    }
    this.resetChannelControlButtons();
    callback();
  }

  setChannelDown(state, callback) {
    if (this.lgTvCtrl.isTvOn()) {
      this.lgTvCtrl.channelDown();
    }
    this.resetChannelControlButtons();
    callback();
  }

  // media control switches
  setPlay(state, callback) {
    if (this.lgTvCtrl.isTvOn()) {
      this.lgTvCtrl.mediaPlay();
    }
    this.resetMediaControlButtons();
    callback();
  }

  setPause(state, callback) {
    if (this.lgTvCtrl.isTvOn()) {
      this.lgTvCtrl.mediaPause();
    }
    this.resetMediaControlButtons();
    callback();
  }

  setStop(state, callback) {
    if (this.lgTvCtrl.isTvOn()) {
      this.lgTvCtrl.mediaStop();
    }
    this.resetMediaControlButtons();
    callback();
  }

  setRewind(state, callback) {
    if (this.lgTvCtrl.isTvOn()) {
      this.lgTvCtrl.mediaRewind();
    }
    this.resetMediaControlButtons();
    callback();
  }

  setFastForward(state, callback) {
    if (this.lgTvCtrl.isTvOn()) {
      this.lgTvCtrl.mediaFastForward();
    }
    this.resetMediaControlButtons();
    callback();
  }

  // notification buttons
  setNotificationButtonState(state, callback, notificationButtonDef) {
    if (this.lgTvCtrl.isTvOn()) {
      let onClick = null;
      let notifyMsg = notificationButtonDef.message;
      if (notificationButtonDef.appId) {
        onClick = {};
        onClick.appId = notificationButtonDef.appId;
        onClick.params = notificationButtonDef.params;
      }
      if (notificationButtonDef.file) {
        try {
          notifyMsg = fs.readFileSync(notificationButtonDef.file, 'utf8');
        } catch (err) {
          this.logDebug(`Failed to load notification button message from the specified file: ${notificationButtonDef.file}. Does the file exist?`);
        }
      }
      this.lgTvCtrl.openToast(notifyMsg, null, null, onClick);
    }
    this.resetNotificationButtons();
    callback();
  }

  // remote control buttons
  setRemoteControlButtonState(state, callback, rcButtonAction) {
    if (this.lgTvCtrl.isTvOn()) {
      this.lgTvCtrl.sendRemoteInputSocketCommand(rcButtonAction);
    }
    this.resetRemoteControlButtons();
    callback();
  }

  // remote sequence buttons
  setRemoteSequenceButtonState(state, callback, remoteSeqDef) {
    if (this.lgTvCtrl.isTvOn()) {
      let curRemoteKeyNum = 0;
      let remoteKeyFunc = () => {
        let curRemoteKey = remoteSeqDef.sequence[curRemoteKeyNum];
        this.lgTvCtrl.sendRemoteInputSocketCommand(curRemoteKey);

        if (curRemoteKeyNum < remoteSeqDef.sequence.length - 1) {
          let curInterval = remoteSeqDef.interval[curRemoteKeyNum] || remoteSeqDef.interval[remoteSeqDef.interval.length - 1];
          curRemoteKeyNum++;
          setTimeout(remoteKeyFunc, curInterval);
        }
      };
      remoteKeyFunc();
    }
    this.resetRemoteSequenceButtons();
    callback();
  }

  // pictureMode buttons
  setPictureModeButtonState(state, callback, pictureModeStr) {
    if (this.lgTvCtrl.isTvOn()) {
      this.lgTvCtrl.setPictureMode(pictureModeStr);
    }
    this.resetPictureModeButtons();
    callback();
  }


  /*--== Stateful ==--*/

  // Mute/Volume emulated as a lightbulb
  getLightbulbMuteState(callback) {
    let isTvMuted = true;
    if (this.lgTvCtrl.isTvOn()) {
      isTvMuted = this.lgTvCtrl.isMuted();
    }
    callback(null, !isTvMuted); // invert value because it is a light bulb
  }

  setLightbulbMuteState(state, callback) {
    if (this.lgTvCtrl.isTvOn()) {
      this.lgTvCtrl.setMute(!state); // this is a light bulb switch so whenever it is off then set mute to true hence state invert
    } else {
      setTimeout(() => {
        this.volumeAsLightbulbService.getCharacteristic(Characteristic.On).updateValue(false);
      }, BUTTON_RESET_TIMEOUT);
    }
    callback();
  }

  getLightbulbVolume(callback) {
    this.getVolume(callback);
  }

  setLightbulbVolume(level, callback) {
    if (this.lgTvCtrl.isTvOn()) {
      this.lgTvCtrl.setVolumeLevel(level);
    } else {
      setTimeout(() => {
        this.volumeAsLightbulbService.getCharacteristic(Characteristic.Brightness).updateValue(0);
      }, BUTTON_RESET_TIMEOUT);
    }
    callback();
  }

  // screen control switch
  getTvScreenState(callback) {
    let isTvScreenOn = false;
    if (this.lgTvCtrl.isTvOn()) {
      isTvScreenOn = this.lgTvCtrl.isTvScreenOn();
    }
    callback(null, isTvScreenOn);
  }

  setTvScreenState(state, callback) {
    if (this.lgTvCtrl.isTvOn()) {
      if (state) {
        this.lgTvCtrl.turnOnTvScreen();
      } else {
        this.lgTvCtrl.turnOffTvScreen();
      }
    } else {
      // if tv is off then instantly turn off the switch
      this.turnOffScreenControlButton();
    }
    callback();
  }

  // screen saver control switch
  getScreenSaverState(callback) {
    let isScreenSaverOn = false;
    if (this.lgTvCtrl.isTvOn()) {
      isScreenSaverOn = this.lgTvCtrl.isScreenSaverActive();
    }
    callback(null, isScreenSaverOn);
  }

  setScreenSaverState(state, callback) {
    if (this.lgTvCtrl.isTvOn()) {
      if (state) {
        this.lgTvCtrl.showScreenSaver();
      } else {
        this.lgTvCtrl.hideScreenSaver();
      }
    } else {
      // if tv is off then instantly turn off the switch
      this.turnOffScreenSaverControlButton();
    }
    callback();
  }

  // app buttons
  getAppButtonState(callback, appId) {
    let appButtonEnabled = false;
    if (this.lgTvCtrl.isTvOn()) {
      appButtonEnabled = this.lgTvCtrl.getForegroundAppAppId() === appId;
    }
    callback(null, appButtonEnabled);
  }

  setAppButtonState(state, callback, appButtonDef) {
    if (this.lgTvCtrl.isTvOn()) {
      if (state) {
        //disable currently active app button
        this.disableActiveAppButton();

        //open the selected app
        this.lgTvCtrl.launchApp(appButtonDef.appId, appButtonDef.params);

      } else {
        // allow to relaunch an appbutton if it has params, in that case the user wants to open a specific content in the appid and not just the appid
        // this means tapping an active appbutton will realunch the app
        if (appButtonDef.params != null) {
          //open the selected app
          this.lgTvCtrl.launchApp(appButtonDef.appId, appButtonDef.params);
        }

        // do not allow to turn off the switch,
        setTimeout(() => {
          this.enableActiveAppButton()
        }, BUTTON_RESET_TIMEOUT);
      }
    } else {
      // if TV is off, then try to turn on tv and open the app
      this.lgTvCtrl.turnOnTvAndLaunchApp(appButtonDef.appId, appButtonDef.params);
    }
    callback();
  }

  // channel buttons
  getChannelButtonState(callback, channelNum) {
    let channelButtonEnabled = false;
    if (this.lgTvCtrl.isTvOn()) {
      channelButtonEnabled = this.lgTvCtrl.getCurrentLiveTvChannelNumber() === channelNum;
    }
    callback(null, channelButtonEnabled);
  }

  setChannelButtonState(state, callback, channelButtonDef) {
    if (this.lgTvCtrl.isTvOn()) {
      if (state) {
        //disable currently active channel
        this.disableActiveChannelButton();

        //open the selected channel
        this.lgTvCtrl.switchToLiveTvAndOpenChannel(channelButtonDef.channelNumber, channelButtonDef.channelId);
      } else {
        // do not allow to turn off the switch,
        setTimeout(() => {
          this.enableActiveChannelButton()
        }, BUTTON_RESET_TIMEOUT);
      }
    } else {
      // if TV is off, then try to turn on the tv and set the channel
      this.lgTvCtrl.turnOn().then(() => {
        this.lgTvCtrl.openLiveTvChannel(channelButtonDef.channelNumber, channelButtonDef.channelId);
      })
    }
    callback();
  }

  // sound output buttons
  getSoundOutputButtonState(callback, soundOutput) {
    let soundOutputButtonEnabled = false;
    if (this.lgTvCtrl.isTvOn()) {
      soundOutputButtonEnabled = this.lgTvCtrl.getActiveSoundOutput() === soundOutput;
    }
    callback(null, soundOutputButtonEnabled);
  }

  setSoundOutputButtonState(state, callback, soundOutput) {
    if (this.lgTvCtrl.isTvOn()) {
      if (state) {
        //disable currently active sound output button
        this.disableActiveSoundOutputButton();

        //change the sound output to the selected one
        this.lgTvCtrl.changeSoundOutput(soundOutput);
      } else {
        // do not allow to turn off the switch,
        setTimeout(() => {
          this.enableActiveSoundOutputButton()
        }, BUTTON_RESET_TIMEOUT);
      }
    } else {
      // if TV is off then instantly disable the pressed button
      this.turnOffSoundOutputButton(soundOutput);
    }
    callback();
  }


  /*----------========== STATUS HELPERS ==========----------*/

  updatePowerStatus() {
    if (this.lgTvCtrl && this.lgTvCtrl.isTvOn()) {
      if (this.tvService) this.tvService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE);
    } else {
      if (this.tvService) this.tvService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE);
    }
  }

  updateActiveInputSource() {
    if (this.lgTvCtrl && this.lgTvCtrl.isTvOn()) {
      if (this.tvService) this.tvService.getCharacteristic(Characteristic.ActiveIdentifier).updateValue(this.getActiveInputId());
    } else {
      if (this.tvService) this.tvService.getCharacteristic(Characteristic.ActiveIdentifier).updateValue(NOT_EXISTING_INPUT);
    }
  }

  updateTvAudioStatus() {
    if (this.lgTvCtrl && this.lgTvCtrl.isTvOn()) {
      if (this.tvSpeakerService) this.tvSpeakerService.getCharacteristic(Characteristic.Mute).updateValue(this.lgTvCtrl.isMuted());
      if (this.tvSpeakerService) this.tvSpeakerService.getCharacteristic(Characteristic.Volume).updateValue(this.lgTvCtrl.getVolumeLevel());
      if (this.volumeAsLightbulbService) this.volumeAsLightbulbService.getCharacteristic(Characteristic.On).updateValue(!this.lgTvCtrl.isMuted()); // invert muted value because it is a lightbulb
      if (this.volumeAsLightbulbService) this.volumeAsLightbulbService.getCharacteristic(Characteristic.Brightness).updateValue(this.lgTvCtrl.getVolumeLevel());
    } else {
      if (this.tvSpeakerService) this.tvSpeakerService.getCharacteristic(Characteristic.Mute).updateValue(true);
      if (this.tvSpeakerService) this.tvSpeakerService.getCharacteristic(Characteristic.Volume).updateValue(0);
      if (this.volumeAsLightbulbService) this.volumeAsLightbulbService.getCharacteristic(Characteristic.Brightness).updateValue(0);
      if (this.volumeAsLightbulbService) this.volumeAsLightbulbService.getCharacteristic(Characteristic.On).updateValue(false);
    }
  }

  updateAppButtons() {
    if (this.configuredAppButtons) {
      if (this.lgTvCtrl && this.lgTvCtrl.isTvOn()) {
        // check if there there is an app button for the current active app and enable it
        this.enableActiveAppButton();
      } else {
        // tv is off, all app buttons off
        this.disableAllAppButtons();
      }
    }
  }

  updateChannelButtons() {
    if (this.configuredChannelButtons) {
      if (this.lgTvCtrl && this.lgTvCtrl.isTvOn() && this.lgTvCtrl.isLiveTvActive()) {
        // tv is on and live tv active, check if there is an channel button for active channel and set it to on and the rest to off
        this.enableActiveChannelButton();
      } else {
        // tv is off, all channel buttons off
        this.disableAllChannelButtons();
      }
    }
  }

  updateSoundOutputButtons() {
    if (this.configuredSoundOutputButtons) {
      if (this.lgTvCtrl && this.lgTvCtrl.isTvOn()) {
        // tv is on check which sound output is enabled and enable the button if exists
        this.enableActiveSoundOutputButton();
      } else {
        // tv is off, all sound output buttons should be disabled
        this.disableAllSoundOutputButtons();
      }
    }
  }

  updateScreenStatus() {
    if (this.lgTvCtrl && this.lgTvCtrl.isTvOn()) {
      if (this.screenControlService) this.screenControlService.getCharacteristic(Characteristic.On).updateValue(this.lgTvCtrl.isTvScreenOn());
    } else {
      if (this.screenControlService) this.screenControlService.getCharacteristic(Characteristic.On).updateValue(false);
    }
  }

  updateScreenSaverStatus() {
    if (this.lgTvCtrl && this.lgTvCtrl.isTvOn()) {
      if (this.screenSaverControlService) this.screenSaverControlService.getCharacteristic(Characteristic.On).updateValue(this.lgTvCtrl.isScreenSaverActive());
    } else {
      if (this.screenSaverControlService) this.screenSaverControlService.getCharacteristic(Characteristic.On).updateValue(false);
    }
  }

  updateTvStatusFull() {
    this.updatePowerStatus();
    this.updateActiveInputSource();
    this.updateTvAudioStatus();
    this.updateAppButtons();
    this.updateChannelButtons();
    this.updateSoundOutputButtons();
    this.updateScreenStatus();
    this.updateScreenSaverStatus();
  }


  /*----------========== STATEFUL SERVICES HELPERS ==========----------*/

  turnOffScreenControlButton() {
    setTimeout(() => {
      if (this.screenControlService) this.screenControlService.getCharacteristic(Characteristic.On).updateValue(false);
    }, BUTTON_RESET_TIMEOUT);
  }

  turnOffScreenSaverControlButton() {
    setTimeout(() => {
      if (this.screenSaverControlService) this.screenSaverControlService.getCharacteristic(Characteristic.On).updateValue(false);
    }, BUTTON_RESET_TIMEOUT);
  }

  turnOffSoundOutputButton(soundOutput) {
    if (this.configuredSoundOutputButtons) {
      let soundOutputDef = this.configuredSoundOutputButtons[soundOutput];
      if (soundOutputDef) {
        setTimeout(() => {
          soundOutputDef.buttonService.getCharacteristic(Characteristic.On).updateValue(false);
        }, BUTTON_RESET_TIMEOUT);
      }
    }
  }

  /*----------========== STATELESS SERVICES HELPERS ==========----------*/

  createStatlessSwitchService(name, id, setterFn) {
    let newStatelessSwitchService = new Service.Switch(name, id);
    newStatelessSwitchService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getStatelessSwitchState.bind(this))
      .on('set', (state, callback) => {
        setterFn(state, callback);
      });
    return newStatelessSwitchService;
  }

  getStatelessSwitchState(callback) {
    callback(null, false);
  }

  resetVolumeControlButtons() {
    setTimeout(() => {
      if (this.volumeUpService) this.volumeUpService.getCharacteristic(Characteristic.On).updateValue(false);
      if (this.volumeDownService) this.volumeDownService.getCharacteristic(Characteristic.On).updateValue(false);
    }, BUTTON_RESET_TIMEOUT);
  }

  resetChannelControlButtons() {
    setTimeout(() => {
      if (this.channelUpService) this.channelUpService.getCharacteristic(Characteristic.On).updateValue(false);
      if (this.channelDownService) this.channelDownService.getCharacteristic(Characteristic.On).updateValue(false);
    }, BUTTON_RESET_TIMEOUT);
  }

  resetMediaControlButtons() {
    setTimeout(() => {
      if (this.mediaPlayService) this.mediaPlayService.getCharacteristic(Characteristic.On).updateValue(false);
      if (this.mediaPauseService) this.mediaPauseService.getCharacteristic(Characteristic.On).updateValue(false);
      if (this.mediaStopService) this.mediaStopService.getCharacteristic(Characteristic.On).updateValue(false);
      if (this.mediaRewindService) this.mediaRewindService.getCharacteristic(Characteristic.On).updateValue(false);
      if (this.mediaFastForwardService) this.mediaFastForwardService.getCharacteristic(Characteristic.On).updateValue(false);
    }, BUTTON_RESET_TIMEOUT);
  }

  resetNotificationButtons() {
    if (this.configuredNotificationButtons) {
      setTimeout(() => {
        this.configuredNotificationButtons.forEach((item, i) => {
          item.buttonService.getCharacteristic(Characteristic.On).updateValue(false);
        });
      }, BUTTON_RESET_TIMEOUT);
    }
  }

  resetRemoteControlButtons() {
    if (this.configuredRemoteControlButtons) {
      setTimeout(() => {
        this.configuredRemoteControlButtons.forEach((item, i) => {
          item.buttonService.getCharacteristic(Characteristic.On).updateValue(false);
        });
      }, BUTTON_RESET_TIMEOUT);
    }
  }

  resetRemoteSequenceButtons() {
    if (this.configuredRemoteSequenceButtons) {
      setTimeout(() => {
        this.configuredRemoteSequenceButtons.forEach((item, i) => {
          item.buttonService.getCharacteristic(Characteristic.On).updateValue(false);
        });
      }, BUTTON_RESET_TIMEOUT);
    }
  }

  resetPictureModeButtons() {
    if (this.configuredPictureModeButtons) {
      setTimeout(() => {
        this.configuredPictureModeButtons.forEach((item, i) => {
          item.buttonService.getCharacteristic(Characteristic.On).updateValue(false);
        });
      }, BUTTON_RESET_TIMEOUT);
    }
  }

  triggerVolumeUpAutomations() {
    if (this.volumeUpService) {
      // turn the button on and off after a delay to trigger homekit automations
      this.volumeUpService.getCharacteristic(Characteristic.On).updateValue(true);
      setTimeout(() => {
        this.volumeUpService.getCharacteristic(Characteristic.On).updateValue(false);
      }, AUTOMATIONS_TRIGGER_TIMEOUT);
    }
  }

  triggerVolumeDownAutomations() {
    if (this.volumeDownService) {
      // turn the button on and off after a delay to trigger homekit automations
      this.volumeDownService.getCharacteristic(Characteristic.On).updateValue(true);
      setTimeout(() => {
        this.volumeDownService.getCharacteristic(Characteristic.On).updateValue(false);
      }, AUTOMATIONS_TRIGGER_TIMEOUT);
    }
  }


  /*----------========== INPUT HELPERS ==========----------*/

  getActiveInputId() {
    if (this.lgTvCtrl.isTvOn()) {
      let activeInputId = Object.keys(this.configuredInputs).find(key => {
        return this.configuredInputs[key].appId === this.lgTvCtrl.getForegroundAppAppId();
      });
      return parseInt(activeInputId) || NOT_EXISTING_INPUT;
    }
    return NOT_EXISTING_INPUT;
  }

  saveInputConfigToFile() {
    fs.writeFile(this.tvInputConfigFile, JSON.stringify(this.tvInputsConfig), (err) => {
      if (err) {
        this.logWarn('Error occured, could not write TV input config to file: %s', err);
      } else {
        this.logDebug('TV input config successfully saved!');
      }
    });
  }

  saveCurrentInputsToFile() {
    let tvInputList = this.lgTvCtrl.getLaunchPointsList();
    if (tvInputList != null) {
      fs.writeFile(this.tvAvailableInputsFile, JSON.stringify(tvInputList), (err) => {
        if (err) {
          this.logWarn('Error occured, could not write available TV inputs to file: %s', err);
        } else {
          this.logDebug('Successfully updated cached TV inputs!');
        }
      });
    }
  }

  updateVisibilityInputConfigForAppId(appId, visible) {
    if (this.tvInputsConfig[appId] === undefined) {
      this.tvInputsConfig[appId] = {};
    }
    this.tvInputsConfig[appId].visible = visible;
    this.saveInputConfigToFile();
  }

  updateNameInputConfigForAppId(appId, name) {
    if (this.tvInputsConfig[appId] === undefined) {
      this.tvInputsConfig[appId] = {};
    }
    this.tvInputsConfig[appId].name = name;
    this.saveInputConfigToFile();
  }

  initInputSources() {
    let tvInputList = this.lgTvCtrl.getLaunchPointsList();
    let configuredInputsAppIds = Object.keys(this.configuredInputs).map(key => this.configuredInputs[key].appId);

    // create an initial tv inputs config file if does not exist (no config loaded)
    if (Object.keys(this.tvInputsConfig).length === 0) {
      this.logDebug('No inputs config file found! Initializing the inputs config file!');
      let externalInputs = this.lgTvCtrl.getExternalInputList();
      let externalInputsAppIds = externalInputs.map(item => item.appId);
      tvInputList.forEach((input, i) => {
        let newConf = {};
        newConf.visible = externalInputsAppIds.includes(input.appId) || input.appId === this.lgTvCtrl.getLiveTvAppId(); // per default only external inputs and live tv are enabled, all othe rinitally disabled
        newConf.name = input.name;
        this.tvInputsConfig[input.appId] = newConf;
      });

      // save the initial config
      this.saveInputConfigToFile();
    }

    // if not inputs yet configured then do a clean init
    if (configuredInputsAppIds.length === 0) {
      this.addInputSources(tvInputList);
      this.saveCurrentInputsToFile();
    } else {
      // else update the current configured inputs
      let tvInputAppIds = tvInputList.map(input => input.appId);
      var addedDiff = tvInputAppIds.filter(appId => configuredInputsAppIds.includes(appId) === false);
      var removedDiff = configuredInputsAppIds.filter(appId => tvInputAppIds.includes(appId) === false);

      // inputs changed, write new list to file and update the input sources service
      if (addedDiff.length > 0 || removedDiff.length > 0) {
        this.logDebug('Change in the tv input sources list detected. Updating available inputs file!');
        this.saveCurrentInputsToFile();
      }

      // new apps added
      if (addedDiff.length > 0) {
        this.logDebug('New input sources found since last launch. Updating the tv inputs!');
        let newInputs = tvInputList.filter((input) => {
          return addedDiff.includes(input.appId) === true;
        });
        // add the new input sources
        this.addInputSources(newInputs);
      }

      // apps removed
      if (removedDiff.length > 0) {
        this.logDebug('Some inputs where removed on the tv since last launch. Updating the tv inputs!');
        let removedInputs = Object.keys(this.configuredInputs).filter((inputId) => {
          return removedDiff.includes(this.configuredInputs[inputId].appId) === true;
        });
        removedInputs.forEach((inputId, i) => {
          let inputDef = this.configuredInputs[inputId];
          this.removeInputSource(inputDef);
        });
      }
    }

  }

  newAppInstalledOnTv(appDef) {
    if (appDef && appDef.appId && appDef.name) {
      this.addInputSources([appDef]);
      this.saveCurrentInputsToFile();
    } else {
      this.logDebug('Could not add new input source! Missing required information!');
    }
  }

  appRemovedFromTv(appId) {
    let removedInputId = Object.keys(this.configuredInputs).find((inputId) => {
      return this.configuredInputs[inputId].appId === appId;
    });
    if (removedInputId) {
      let removedInputDef = this.configuredInputs[removedInputId];
      if (removedInputDef) {
        this.removeInputSource(removedInputDef);
        this.saveCurrentInputsToFile();
      }
    } else {
      this.logDebug('Could not remove input source! Missing required information!');
    }
  }


  /*----------========== APP BUTTON HELPERS ==========----------*/

  disableActiveAppButton() {
    if (this.configuredAppButtons) {
      // since there can be multiple appbuttons with the same appid i need to loop through all apputtons and disable all button with the current appId
      Object.entries(this.configuredAppButtons).forEach(([key, val]) => {
        let appId = val.appId;
        if (appId === this.lgTvCtrl.getForegroundAppAppId()) {
          val.buttonService.getCharacteristic(Characteristic.On).updateValue(false);
        }
      });
    }
  }

  enableActiveAppButton() {
    if (this.configuredAppButtons) {
      Object.entries(this.configuredAppButtons).forEach(([key, val]) => {
        let appId = val.appId;
        if (appId === this.lgTvCtrl.getForegroundAppAppId()) {
          val.buttonService.getCharacteristic(Characteristic.On).updateValue(true);
        } else {
          val.buttonService.getCharacteristic(Characteristic.On).updateValue(false);
        }
      });
    }
  }

  disableAllAppButtons() {
    if (this.configuredAppButtons) {
      Object.entries(this.configuredAppButtons).forEach(([key, val]) => {
        val.buttonService.getCharacteristic(Characteristic.On).updateValue(false);
      });
    }
  }


  /*----------========== CHANNEL BUTTON HELPERS ==========----------*/

  disableActiveChannelButton() {
    if (this.configuredChannelButtons) {
      let channelDef = this.configuredChannelButtons[this.lgTvCtrl.getCurrentLiveTvChannelNumber()];
      if (channelDef) {
        channelDef.buttonService.getCharacteristic(Characteristic.On).updateValue(false);
      }
    }
  }

  enableActiveChannelButton() {
    if (this.configuredChannelButtons) {
      Object.entries(this.configuredChannelButtons).forEach(([key, val]) => {
        let channelNum = val.channelNumber;
        if (channelNum === this.lgTvCtrl.getCurrentLiveTvChannelNumber()) {
          val.buttonService.getCharacteristic(Characteristic.On).updateValue(true);
        } else {
          val.buttonService.getCharacteristic(Characteristic.On).updateValue(false);
        }
      });
    }
  }

  disableAllChannelButtons() {
    if (this.configuredChannelButtons) {
      Object.entries(this.configuredChannelButtons).forEach(([key, val]) => {
        val.buttonService.getCharacteristic(Characteristic.On).updateValue(false);
      });
    }
  }


  /*----------========== SOUND OUTPUT BUTTON HELPERS ==========----------*/

  disableActiveSoundOutputButton() {
    if (this.configuredSoundOutputButtons) {
      let soundOutputDef = this.configuredSoundOutputButtons[this.lgTvCtrl.getActiveSoundOutput()];
      if (soundOutputDef) {
        soundOutputDef.buttonService.getCharacteristic(Characteristic.On).updateValue(false);
      }
    }
  }

  enableActiveSoundOutputButton() {
    if (this.configuredSoundOutputButtons) {
      Object.entries(this.configuredSoundOutputButtons).forEach(([key, val]) => {
        let soundOutput = val.soundOutput;
        if (soundOutput === this.lgTvCtrl.getActiveSoundOutput()) {
          val.buttonService.getCharacteristic(Characteristic.On).updateValue(true);
        } else {
          val.buttonService.getCharacteristic(Characteristic.On).updateValue(false);
        }
      });
    }
  }

  disableAllSoundOutputButtons() {
    if (this.configuredSoundOutputButtons) {
      Object.entries(this.configuredSoundOutputButtons).forEach(([key, val]) => {
        val.buttonService.getCharacteristic(Characteristic.On).updateValue(false);
      });
    }
  }


  /*----------========== HELPERS ==========----------*/

  checkArrayConfigProperty(arrObj, propName) {
    if (arrObj === undefined || arrObj === null || arrObj.length <= 0) {
      return false;
    }

    if (Array.isArray(arrObj) === false) {
      this.logWarn(`The ${propName} property needs to be defined as an array! Please correct your config.json if you want to use the service.`);
      return false;
    }

    return true;
  }

  createError(msg) {
    return new Error(`[${this.name}] TV is not connected, ` + msg);
  }


  /*----------========== LOG ==========----------*/

  logInfo(message, ...args) {
    this.log.info((this.name ? `[${this.name}] ` : "") + message, ...args);
  }

  logWarn(message, ...args) {
    this.log.warn((this.name ? `[${this.name}] ` : "") + message, ...args);
  }

  logDebug(message, ...args) {
    this.log.debug((this.name ? `[${this.name}] ` : "") + message, ...args);
  }

  logError(message, ...args) {
    this.log.error((this.name ? `[${this.name}] ` : "") + message, ...args);
  }

}


/*----------========== PLATFORM STUFF ==========----------*/

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
          new webosTvDevice(this.log, device, this.api);
        }
      }
    } else if (this.config.devices) {
      this.log.info('The devices property is not of type array. Cannot initialize. Type: %s', typeof this.config.devices);
    }

    // also read from config.tvs
    if (this.config.tvs && Array.isArray(this.config.tvs)) {
      for (let tv of this.config.tvs) {
        if (tv) {
          new webosTvDevice(this.log, tv, this.api);
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
