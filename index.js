import * as fs from 'fs';
import mkdirp from 'mkdirp';
import LgTvController from './lib/LgTvController.js';
import Events from './lib/Events.js';

let Service, Characteristic, Homebridge, Accessory, HapStatusError, HAPStatus;

const PLUGIN_NAME = 'homebridge-webos-tv';
const PLATFORM_NAME = 'webostv';
const PLUGIN_VERSION = '2.4.3';

// General constants
const NOT_EXISTING_INPUT = 999999;
const DEFAULT_INPUT_SOURCES_LIMIT = 45;
const BUTTON_RESET_TIMEOUT = 20; // in milliseconds
const AUTOMATIONS_TRIGGER_TIMEOUT = 400; // in milliseconds

export default (homebridge) => {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  Homebridge = homebridge;
  Accessory = homebridge.platformAccessory;
  HapStatusError = homebridge.hap.HapStatusError;
  HAPStatus = homebridge.hap.HAPStatus;
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
    this.silentLog = config.silentLog;
    if (this.deepDebugLog === undefined) {
      this.deepDebugLog = false;
    }
    if (this.silentLog === undefined) {
      this.silentLog = false;
    }
    this.inputSourcesLimit = config.inputSourcesLimit || DEFAULT_INPUT_SOURCES_LIMIT;
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
    this.serviceMenuButton = config.serviceMenuButton;
    if (this.serviceMenuButton === undefined) {
      this.serviceMenuButton = false;
    }
    this.ezAdjustButton = config.ezAdjustButton;
    if (this.ezAdjustButton === undefined) {
      this.ezAdjustButton = false;
    }
    this.backlightControl = config.backlightControl;
    if (this.backlightControl === undefined) {
      this.backlightControl = false;
    }
    this.brightnessControl = config.brightnessControl;
    if (this.brightnessControl === undefined) {
      this.brightnessControl = false;
    }
    this.colorControl = config.colorControl;
    if (this.colorControl === undefined) {
      this.colorControl = false;
    }
    this.contrastControl = config.contrastControl;
    if (this.contrastControl === undefined) {
      this.contrastControl = false;
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
    this.soundModeButtons = config.soundModeButtons;
    this.systemSettingsButtons = config.systemSettingsButtons;
    this.triggers = config.triggers;


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
    this.lgTvCtrl.setSilentLogEnabled(this.silentLog);
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

    this.lgTvCtrl.on(Events.SCREEN_STATE_CHANGED, () => {
      this.updateScreenStatus();
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
      this.updateOccupancyTriggers();
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

    this.lgTvCtrl.on(Events.PICTURE_SETTINGS_CHANGED, (res) => {
      this.updatePictureSettingsServices();
      this.updateOccupancyTriggers();
      if (this.lgTvCtrl.getCurrentPictureMode()) {
        this.updatePictureModeButtons();
      }
    });

    this.lgTvCtrl.on(Events.SOUND_SETTINGS_CHANGED, (res) => {
      if (this.lgTvCtrl.getCurrentSoundMode()) {
        this.updateSoundModeButtons();
      }
    });

    Events.SOUND_SETTINGS_CHANGED
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
    this.preparServiceMenuButtonService();
    this.prepareEzAdjustButtonService();
    this.preparePictureSettingsControlServices();
    this.prepareAppButtonService();
    this.prepareChannelButtonService();
    this.prepareNotificationButtonService();
    this.prepareRemoteControlButtonService();
    this.prepareSoundOutputButtonService();
    this.prepareRemoteSequenceButtonsService();
    this.preparePictureModeButtonService();
    this.prepareSoundModeButtonService();
    this.prepareSystemSettingsButtonService();
    this.prepareTriggersService();
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
      .onGet(this.getPowerState.bind(this))
      .onSet(this.setPowerState.bind(this));

    this.tvService
      .setCharacteristic(Characteristic.ActiveIdentifier, NOT_EXISTING_INPUT); // do not preselect any inputs since there are no default inputs
    this.tvService
      .getCharacteristic(Characteristic.ActiveIdentifier)
      .onGet(this.getActiveIdentifier.bind(this))
      .onSet(this.setActiveIdentifier.bind(this));

    this.tvService
      .getCharacteristic(Characteristic.RemoteKey)
      .onSet(this.remoteKeyPress.bind(this));

    this.tvService
      .getCharacteristic(Characteristic.PowerModeSelection)
      .onSet(this.setPowerModeSelection.bind(this));


    // not supported yet??
    /*
    this.tvService
      .getCharacteristic(Characteristic.PictureMode)
      .onSet((newValue) => {
    	console.log('set PictureMode => setNewValue: ' + newValue);
      });
      */


    this.tvAccesory.addService(this.tvService);

    // prepare the additional native services - control center tv speaker and inputs
    this.prepareTvSpeakerService();
    this.prepareInputSourcesService();
  }

  prepareTvSpeakerService() {
    const serviceName = this.name + ' Volume';
    this.tvSpeakerService = new Service.TelevisionSpeaker(serviceName, 'tvSpeakerService');
    this.tvSpeakerService
      .setCharacteristic(Characteristic.ConfiguredName, serviceName);
    this.tvSpeakerService
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
    this.tvSpeakerService
      .getCharacteristic(Characteristic.VolumeSelector)
      .onSet(this.setVolumeSelectorState.bind(this));
    this.tvSpeakerService
      .getCharacteristic(Characteristic.Mute)
      .onGet(this.getMuteState.bind(this))
      .onSet(this.setMuteState.bind(this));
    this.tvSpeakerService
      .addCharacteristic(Characteristic.Volume)
      .onGet(this.getVolume.bind(this))
      .onSet(this.setVolume.bind(this));

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
        .onSet((state) => {
          this.setInputTargetVisibility(state, newInputDef);
        });

      // set input name
      inputSourceService.getCharacteristic(Characteristic.ConfiguredName)
        .onSet((value) => {
          this.setInputConfiguredName(value, newInputDef);
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

    // slider - lightbulb or fan
    if (this.volumeControl === true || this.volumeControl === "both" || this.volumeControl === 'slider' || this.volumeControl === 'lightbulb') {
      this.volumeAsLightbulbService = new Service.Lightbulb('Volume', 'volumeService');
      this.volumeAsLightbulbService.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.volumeAsLightbulbService.setCharacteristic(Characteristic.ConfiguredName, 'Volume');
      this.volumeAsLightbulbService
        .getCharacteristic(Characteristic.On)
        .onGet(this.getLightbulbMuteState.bind(this))
        .onSet(this.setLightbulbMuteState.bind(this));
      this.volumeAsLightbulbService
        .addCharacteristic(new Characteristic.Brightness())
        .onGet(this.getLightbulbVolume.bind(this))
        .onSet(this.setLightbulbVolume.bind(this));

      this.tvAccesory.addService(this.volumeAsLightbulbService);
    } else if (this.volumeControl === "fan") {
      this.volumeAsFanService = new Service.Fanv2('Volume', 'volumeService');
      this.volumeAsFanService.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.volumeAsFanService.setCharacteristic(Characteristic.ConfiguredName, 'Volume');
      this.volumeAsFanService
        .getCharacteristic(Characteristic.Active)
        .onGet(this.getFanMuteState.bind(this))
        .onSet(this.setFanMuteState.bind(this));
      this.volumeAsFanService.addCharacteristic(Characteristic.RotationSpeed)
        .onGet(this.getRotationSpeedVolume.bind(this))
        .onSet(this.setRotationSpeedVolume.bind(this));

      this.tvAccesory.addService(this.volumeAsFanService);
    }


    // volume up/down buttons
    if (this.volumeControl === true || this.volumeControl === "both" || this.volumeControl === 'buttons') {

      this.volumeUpService = this.createStatlessSwitchService('Volume Up', 'volumeUpService', this.setVolumeUp.bind(this));
      this.tvAccesory.addService(this.volumeUpService);

      this.volumeDownService = this.createStatlessSwitchService('Volume Down', 'volumeDownService', this.setVolumeDown.bind(this));
      this.tvAccesory.addService(this.volumeDownService);
    }
  }


  prepareChannelControlService() {
    if (!this.channelControl) {
      return;
    }

    this.channelUpService = this.createStatlessSwitchService('Channel Up', 'channelUpService', this.setChannelUp.bind(this));
    this.tvAccesory.addService(this.channelUpService);

    this.channelDownService = this.createStatlessSwitchService('Channel Down', 'channelDownService', this.setChannelDown.bind(this));
    this.tvAccesory.addService(this.channelDownService);
  }


  prepareMediaControlService() {
    if (!this.mediaControl) {
      return;
    }

    this.mediaPlayService = this.createStatlessSwitchService('Play', 'mediaPlayService', this.setPlay.bind(this));
    this.tvAccesory.addService(this.mediaPlayService);

    this.mediaPauseService = this.createStatlessSwitchService('Pause', 'mediaPauseService', this.setPause.bind(this));
    this.tvAccesory.addService(this.mediaPauseService);

    this.mediaStopService = this.createStatlessSwitchService('Stop', 'mediaStopService', this.setStop.bind(this));
    this.tvAccesory.addService(this.mediaStopService);

    this.mediaRewindService = this.createStatlessSwitchService('Rewind', 'mediaRewindService', this.setRewind.bind(this));
    this.tvAccesory.addService(this.mediaRewindService);

    this.mediaFastForwardService = this.createStatlessSwitchService('Fast Forward', 'mediaFastForwardService', this.setFastForward.bind(this));
    this.tvAccesory.addService(this.mediaFastForwardService);
  }

  prepareScreenControlService() {
    if (!this.screenControl) {
      return;
    }

    // create the service
    this.screenControlService = new Service.Switch('Screen', 'screenControlService');
    this.screenControlService.addOptionalCharacteristic(Characteristic.ConfiguredName);
    this.screenControlService.setCharacteristic(Characteristic.ConfiguredName, 'Screen');
    this.screenControlService
      .getCharacteristic(Characteristic.On)
      .onGet(this.getTvScreenState.bind(this))
      .onSet(this.setTvScreenState.bind(this));

    this.tvAccesory.addService(this.screenControlService);
  }

  prepareScreenSaverControlService() {
    if (!this.screenSaverControl) {
      return;
    }

    // create the service
    this.screenSaverControlService = new Service.Switch('Screen Saver', 'screenSaverControlService');
    this.screenSaverControlService.addOptionalCharacteristic(Characteristic.ConfiguredName);
    this.screenSaverControlService.setCharacteristic(Characteristic.ConfiguredName, 'Screen Saver');
    this.screenSaverControlService
      .getCharacteristic(Characteristic.On)
      .onGet(this.getScreenSaverState.bind(this))
      .onSet(this.setScreenSaverState.bind(this));

    this.tvAccesory.addService(this.screenSaverControlService);
  }

  preparServiceMenuButtonService() {
    if (!this.serviceMenuButton) {
      return;
    }

    this.serviceMenuButtonService = this.createStatlessSwitchService('Service Menu', 'serviceMenuButtonService', this.setServiceMenu.bind(this));
    this.tvAccesory.addService(this.serviceMenuButtonService);
  }

  prepareEzAdjustButtonService() {
    if (!this.ezAdjustButton) {
      return;
    }

    this.ezAdjustButtonService = this.createStatlessSwitchService('ezAdjust', 'ezAdjustButtonService', this.setEzAdjust.bind(this));
    this.tvAccesory.addService(this.ezAdjustButtonService);
  }

  preparePictureSettingsControlServices() {
    if (this.backlightControl) {
      this.backlightControlService = this.createPictureSettingsLightbulbService('Backlight', 'backlightControlService', this.setLightbulbBacklightOnState, this.setLightbulbBacklight, this.getLightbulbBacklight, );
      this.tvAccesory.addService(this.backlightControlService);
    }

    if (this.brightnessControl) {
      this.brightnessControlService = this.createPictureSettingsLightbulbService('Brightness', 'brightnessControlService', this.setLightbulbBrightnessOnState, this.setLightbulbBrightness, this.getLightbulbBrightness, );
      this.tvAccesory.addService(this.brightnessControlService);
    }

    if (this.colorControl) {
      this.colorControlService = this.createPictureSettingsLightbulbService('Color', 'colorControlService', this.setLightbulbColorOnState, this.setLightbulbColor, this.getLightbulbColor, );
      this.tvAccesory.addService(this.colorControlService);
    }

    if (this.contrastControl) {
      this.contrastControlService = this.createPictureSettingsLightbulbService('Contrast', 'contrastControlService', this.setLightbulbContrastOnState, this.setLightbulbContrast, this.getLightbulbContrast, );
      this.tvAccesory.addService(this.contrastControlService);
    }
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
      newAppButtonDef.name = value.name || 'App - ' + newAppButtonDef.appId;

      // params
      newAppButtonDef.params = value.params || {};

      // create the service
      let newAppButtonService = this.createStatefulSwitchService(newAppButtonDef.name, 'appButtonService' + i,
        () => {
          return this.getAppButtonState(newAppButtonDef.appId);
        }, (state) => {
          this.setAppButtonState(state, newAppButtonDef);
        });

      // add to the tv service
      this.tvAccesory.addService(newAppButtonService);

      // save the configured channel button service
      newAppButtonDef.switchService = newAppButtonService;

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
      newChannelButtonDef.name = value.name || 'Channel - ' + newChannelButtonDef.channelNumber;

      // create the service
      let newChannelButtonService = this.createStatefulSwitchService(newChannelButtonDef.name, 'channelButtonService' + i,
        () => {
          return this.getChannelButtonState(newChannelButtonDef.channelNumber);
        }, (state) => {
          this.setChannelButtonState(state, newChannelButtonDef);
        });

      // add to the tv service
      this.tvAccesory.addService(newChannelButtonService);

      // save the configured channel button service
      newChannelButtonDef.switchService = newChannelButtonService;

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
      newNotificationButtonDef.name = value.name || 'Notification - ' + newNotificationButtonDef.message;

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
      let newNotificationButtonService = this.createStatlessSwitchService(newNotificationButtonDef.name, 'notificationButtonService' + i, (state) => {
        this.setNotificationButtonState(state, newNotificationButtonDef);
      });

      this.tvAccesory.addService(newNotificationButtonService);

      // save the configured notification button service
      newNotificationButtonDef.switchService = newNotificationButtonService;

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
      newRemoteControlButtonDef.name = value.name || 'Remote - ' + newRemoteControlButtonDef.action;

      // create the stateless button service
      let newRemoteControlButtonService = this.createStatlessSwitchService(newRemoteControlButtonDef.name, 'remoteControlButtonService' + i, (state) => {
        this.setRemoteControlButtonState(state, newRemoteControlButtonDef.action);
      });

      this.tvAccesory.addService(newRemoteControlButtonService);

      // save the configured remote control button service
      newRemoteControlButtonDef.switchService = newRemoteControlButtonService;

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
      newSoundOutputButtonDef.name = value.name || 'Sound Output - ' + newSoundOutputButtonDef.soundOutput;

      // create the service
      let newSoundOutputButtonService = this.createStatefulSwitchService(newSoundOutputButtonDef.name, 'soundOutputButtonService' + i,
        () => {
          return this.getSoundOutputButtonState(newSoundOutputButtonDef.soundOutput);
        }, (state) => {
          this.setSoundOutputButtonState(state, newSoundOutputButtonDef.soundOutput);
        });

      // add to the tv service
      this.tvAccesory.addService(newSoundOutputButtonService);

      // save the configured sound output button service
      newSoundOutputButtonDef.switchService = newSoundOutputButtonService;

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
      newPictureModeButtonDef.pictureMode = newPictureModeButtonDef.pictureMode.toString();

      // get name
      newPictureModeButtonDef.name = value.name || 'Picture Mode - ' + newPictureModeButtonDef.pictureMode;

      // create the service
      let newPictureModeButtonService = this.createStatefulSwitchService(newPictureModeButtonDef.name, 'pictureModeButtonsService' + i,
        () => {
          return this.getPictureModeButtonState(newPictureModeButtonDef.pictureMode);
        }, (state) => {
          this.setPictureModeButtonState(state, newPictureModeButtonDef.pictureMode, true);
        });

      this.tvAccesory.addService(newPictureModeButtonService);

      // save the configured picture mode button service
      newPictureModeButtonDef.switchService = newPictureModeButtonService;

      this.configuredPictureModeButtons.push(newPictureModeButtonDef);

    });
  }

  prepareSoundModeButtonService() {
    if (this.checkArrayConfigProperty(this.soundModeButtons, "soundModeButtons") === false) {
      return;
    }

    this.configuredSoundModeButtons = [];

    this.soundModeButtons.forEach((value, i) => {

      // create a new sound mode button definition
      let newSoundModeButtonDef = {};

      // get the sound mode name
      newSoundModeButtonDef.soundMode = value.soundMode || value;

      // if soundMode null or empty then skip this sound mode button, soundMode is required for a sound mode button
      if (!newSoundModeButtonDef.soundMode || newSoundModeButtonDef.soundMode === '' || typeof newSoundModeButtonDef.soundMode !== 'string') {
        this.logWarn(`Missing soundMode or soundMode is not of type string. Cannot add sound mode button!`);
        return;
      }

      // make sure the soundMode is string
      newSoundModeButtonDef.soundMode = newSoundModeButtonDef.soundMode.toString();

      // get name
      newSoundModeButtonDef.name = value.name || 'Sound Mode - ' + newSoundModeButtonDef.soundMode;

      // create the service
      let newSoundModeButtonService = this.createStatefulSwitchService(newSoundModeButtonDef.name, 'soundModeButtonsService' + i,
        () => {
          return this.getSoundModeButtonState(newSoundModeButtonDef.soundMode);
        }, (state) => {
          this.setSoundModeButtonState(state, newSoundModeButtonDef.soundMode);
        });

      // add to the tv service
      this.tvAccesory.addService(newSoundModeButtonService);

      // save the configured sound mode button service
      newSoundModeButtonDef.switchService = newSoundModeButtonService;

      this.configuredSoundModeButtons[newSoundModeButtonDef.soundMode] = newSoundModeButtonDef;

    });
  }

  prepareSystemSettingsButtonService() {
    if (this.checkArrayConfigProperty(this.systemSettingsButtons, "systemSettingsButtons") === false) {
      return;
    }

    this.configuredSystemSettingsButtons = [];

    this.systemSettingsButtons.forEach((value, i) => {

      // create a new system setting button definition
      let newSystemSettingsButtonDef = {};

      // get the category object
      newSystemSettingsButtonDef.category = value.category;

      // if category null or empty then skip this system settings button, category is required for a system settings button
      if (!newSystemSettingsButtonDef.category || newSystemSettingsButtonDef.category === '' || typeof newSystemSettingsButtonDef.category !== 'string') {
        this.logWarn(`Missing category or category is not of type string. Cannot add system settings button!`);
        return;
      }

      // get the settings object
      newSystemSettingsButtonDef.settings = value.settings;

      // if settings null or empty then skip this system settings button, settings is required for a system settings button
      if (newSystemSettingsButtonDef.settings === null || newSystemSettingsButtonDef.settings === undefined) {
        this.logWarn(`Missing settings defintion. Cannot add system settings button!`);
        return;
      }

      // get name
      newSystemSettingsButtonDef.name = value.name || 'System Settings - ' + i;

      // create the stateless button service
      let newSystemModeSettingsService = this.createStatlessSwitchService(newSystemSettingsButtonDef.name, 'systemSettingsService' + i, (state) => {
        this.setSystemSettingsButtonState(state, newSystemSettingsButtonDef);
      });

      this.tvAccesory.addService(newSystemModeSettingsService);

      // save the configured system settings button service
      newSystemSettingsButtonDef.switchService = newSystemModeSettingsService;

      this.configuredSystemSettingsButtons.push(newSystemSettingsButtonDef);

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
      newRemoteSequenceButtonDef.name = value.name || 'Sequence ' + i;

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
      let newRemoteSequenceButtonService = this.createStatlessSwitchService(newRemoteSequenceButtonDef.name, 'remoteSequenceButtonsService' + i, (state) => {
        this.setRemoteSequenceButtonState(state, newRemoteSequenceButtonDef);
      });

      this.tvAccesory.addService(newRemoteSequenceButtonService);

      // save the configured remote sequence button service
      newRemoteSequenceButtonDef.switchService = newRemoteSequenceButtonService;

      this.configuredRemoteSequenceButtons.push(newRemoteSequenceButtonDef);

    });
  }


  prepareTriggersService() {
    if (!this.triggers) {
      return;
    }

    if (this.triggers.volume) {
      this.volumeTriggerDef = this.createTriggerOccupancySensor('volume', this.getTvVolume.bind(this));
      this.tvAccesory.addService(this.volumeTriggerDef.service);
    }

    if (this.triggers.backlight) {
      this.backlightTriggerDef = this.createTriggerOccupancySensor('backlight', this.getLightbulbBacklight.bind(this));
      this.tvAccesory.addService(this.backlightTriggerDef.service);
    }

    if (this.triggers.brightness) {
      this.brightnessTriggerDef = this.createTriggerOccupancySensor('brightness', this.getLightbulbBrightness.bind(this));
      this.tvAccesory.addService(this.brightnessTriggerDef.service);
    }

    if (this.triggers.color) {
      this.colorTriggerDef = this.createTriggerOccupancySensor('color', this.getLightbulbColor.bind(this));
      this.tvAccesory.addService(this.colorTriggerDef.service);
    }

    if (this.triggers.contrast) {
      this.contrastTriggerDef = this.createTriggerOccupancySensor('contrast', this.getLightbulbContrast.bind(this));
      this.tvAccesory.addService(this.contrastTriggerDef.service);
    }
  }


  /*----------========== HOMEBRIDGE STATE SETTERS/GETTERS ==========----------*/

  /*---=== Tv service ===---*/

  // Power
  getPowerState() {
    return this.isTvOn() ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
  }

  setPowerState(state) {
    if (this.lgTvCtrl) {
      let isPowerOn = state === Characteristic.Active.ACTIVE;
      this.lgTvCtrl.setTvPowerState(isPowerOn);
    } else {
      throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  // Active identifier
  getActiveIdentifier() {
    return this.getActiveInputId();
  }

  setActiveIdentifier(inputIdentifier) {
    this.logDebug('Trying to switch input to identifier: %d', inputIdentifier);
    if (this.configuredInputs[inputIdentifier]) {
      this.logDebug('Input source changed, new input source identifier: %d, source appId: %s', inputIdentifier, this.configuredInputs[inputIdentifier].appId);
      this.lgTvCtrl.turnOnTvAndLaunchApp(this.configuredInputs[inputIdentifier].appId, this.configuredInputs[inputIdentifier].params);
    } else {
      this.logDebug('No configured input with identifier: %d found!', inputIdentifier);
    }
  }

  // Volume selector
  setVolumeSelectorState(state) {
    this.logDebug('Volume change over the remote control (VolumeSelector), pressed: %s', state === Characteristic.VolumeSelector.DECREMENT ? 'Down' : 'Up');
    if (state === Characteristic.VolumeSelector.DECREMENT) {
      this.tvVolumeDown();
    } else {
      this.tvVolumeUp();
    }
  }

  // Mute
  getMuteState() {
    return this.isTvMuted();
  }

  setMuteState(state) {
    if (this.isTvOn()) {
      this.lgTvCtrl.setMute(state);
    }
  }

  // volume level
  getVolume() {
    return this.getTvVolume();
  }

  setVolume(level) {
    if (this.isTvOn()) {
      this.lgTvCtrl.setVolumeLevel(level);
    }
  }

  // cc remote control
  remoteKeyPress(remoteKey) {
    switch (remoteKey) {
      case Characteristic.RemoteKey.REWIND:
        this.lgTvCtrl.sendRemoteInputSocketCommand('REWIND');
        break;
      case Characteristic.RemoteKey.FAST_FORWARD:
        this.lgTvCtrl.sendRemoteInputSocketCommand('FASTFORWARD');
        break;
      case Characteristic.RemoteKey.NEXT_TRACK:
        this.logDebug('Next track remote key not supported');
        break;
      case Characteristic.RemoteKey.PREVIOUS_TRACK:
        this.logDebug('Previous track remote key not supported');
        break;
      case Characteristic.RemoteKey.ARROW_UP:
        this.lgTvCtrl.sendRemoteInputSocketCommand(this.getCcRemapCmd('arrowup', 'UP'));
        break;
      case Characteristic.RemoteKey.ARROW_DOWN:
        this.lgTvCtrl.sendRemoteInputSocketCommand(this.getCcRemapCmd('arrowdown', 'DOWN'));
        break;
      case Characteristic.RemoteKey.ARROW_LEFT:
        this.lgTvCtrl.sendRemoteInputSocketCommand(this.getCcRemapCmd('arrowleft', 'LEFT'));
        break;
      case Characteristic.RemoteKey.ARROW_RIGHT:
        this.lgTvCtrl.sendRemoteInputSocketCommand(this.getCcRemapCmd('arrowright', 'RIGHT'));
        break;
      case Characteristic.RemoteKey.SELECT:
        this.lgTvCtrl.sendRemoteInputSocketCommand(this.getCcRemapCmd('select', 'ENTER'));
        break;
      case Characteristic.RemoteKey.BACK:
        this.lgTvCtrl.sendRemoteInputSocketCommand(this.getCcRemapCmd('back', 'BACK'));
        break;
      case Characteristic.RemoteKey.EXIT:
        this.lgTvCtrl.sendRemoteInputSocketCommand('EXIT');
        break;
      case Characteristic.RemoteKey.PLAY_PAUSE:
        if (this.getCcRemapCmd('playpause')) {
          this.lgTvCtrl.sendRemoteInputSocketCommand(this.getCcRemapCmd('playpause'));
        } else {
          this.lgTvCtrl.sendPlayPause();
        }
        break;
      case Characteristic.RemoteKey.INFORMATION:
        this.lgTvCtrl.sendRemoteInputSocketCommand(this.getCcRemapCmd('information', 'INFO'));
        break;
    }
  }

  //power mode selection
  setPowerModeSelection(newValue) {
    this.logDebug('Requested tv settings (PowerModeSelection): ' + newValue);
    this.lgTvCtrl.sendRemoteInputSocketCommand('MENU');
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
  setVolumeUp(state) {
    this.tvVolumeUp();
    this.resetVolumeControlButtons();
  }

  setVolumeDown(state) {
    this.tvVolumeDown();
    this.resetVolumeControlButtons();
  }

  // channel up /down switches
  setChannelUp(state) {
    if (this.isTvOn()) {
      this.lgTvCtrl.channelUp();
    }
    this.resetChannelControlButtons();
  }

  setChannelDown(state) {
    if (this.isTvOn()) {
      this.lgTvCtrl.channelDown();
    }
    this.resetChannelControlButtons();
  }

  // media control switches
  setPlay(state) {
    if (this.isTvOn()) {
      this.lgTvCtrl.mediaPlay();
    }
    this.resetMediaControlButtons();
  }

  setPause(state) {
    if (this.isTvOn()) {
      this.lgTvCtrl.mediaPause();
    }
    this.resetMediaControlButtons();
  }

  setStop(state) {
    if (this.isTvOn()) {
      this.lgTvCtrl.mediaStop();
    }
    this.resetMediaControlButtons();
  }

  setRewind(state) {
    if (this.isTvOn()) {
      this.lgTvCtrl.mediaRewind();
    }
    this.resetMediaControlButtons();
  }

  setFastForward(state) {
    if (this.isTvOn()) {
      this.lgTvCtrl.mediaFastForward();
    }
    this.resetMediaControlButtons();
  }

  // notification buttons
  setNotificationButtonState(state, notificationButtonDef) {
    if (this.isTvOn()) {
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
  }

  // remote control buttons
  setRemoteControlButtonState(state, rcButtonAction) {
    if (this.isTvOn()) {
      this.lgTvCtrl.sendRemoteInputSocketCommand(rcButtonAction);
    }
    this.resetRemoteControlButtons();
  }

  // remote sequence buttons
  setRemoteSequenceButtonState(state, remoteSeqDef) {
    if (this.isTvOn()) {
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
  }

  // picture mode buttons
  getPictureModeButtonState(pictureMode) {
    let pictureModeButtonEnabled = false;
    if (this.isTvOn()) {
      pictureModeButtonEnabled = this.lgTvCtrl.getCurrentPictureMode() === pictureMode;
    }
    return pictureModeButtonEnabled;
  }

  setPictureModeButtonState(state, pictureMode) {
    if (this.isTvOn()) {
      if (state) {
        //disable currently active picture mode button
        this.disableActivePictureModeButton();

        //change the picture output to the selected one
        this.lgTvCtrl.setPictureMode(pictureMode);
      } else {
        // do not allow to turn off the switch,
        setTimeout(() => {
          this.enableActivePictureModeButton()
        }, BUTTON_RESET_TIMEOUT);
      }
    } else {
      // if TV is off then instantly disable the pressed button
      this.turnOffPictureModeButton(pictureMode);
    }
  }

  // picture settings buttons
  setSystemSettingsButtonState(state, systemSettingsDef) {
    if (this.isTvOn()) {
      this.lgTvCtrl.setSystemSettings(systemSettingsDef.category, systemSettingsDef.settings);
    }
    this.resetSystemSettingsButtons();
  }

  //service menu button
  setServiceMenu(state) {
    if (this.isTvOn()) {
      this.lgTvCtrl.openServiceMenu();
    }
    this.resetServiceMenuButton();
  }

  //ezAdjust button
  setEzAdjust(state) {
    if (this.isTvOn()) {
      this.lgTvCtrl.openEzAdjust();
    }
    this.resetEzAdjustButton();
  }


  /*--== Stateful ==--*/

  // Mute/Volume emulated as a lightbulb
  getLightbulbMuteState() {
    return !this.isTvMuted(); // invert value because it is a light bulb
  }

  setLightbulbMuteState(state) {
    if (this.isTvOn()) {
      this.lgTvCtrl.setMute(!state); // this is a light bulb switch so whenever it is off then set mute to true hence state invert
    } else {
      setTimeout(() => {
        this.volumeAsLightbulbService.getCharacteristic(Characteristic.On).updateValue(false);
      }, BUTTON_RESET_TIMEOUT);
    }
  }

  getLightbulbVolume() {
    return this.getTvVolume();
  }

  setLightbulbVolume(level) {
    if (this.isTvOn()) {
      this.lgTvCtrl.setVolumeLevel(level);
    } else {
      setTimeout(() => {
        this.volumeAsLightbulbService.getCharacteristic(Characteristic.Brightness).updateValue(0);
      }, BUTTON_RESET_TIMEOUT);
    }
  }

  // Mute/Volume emulated as a fan
  getFanMuteState() {
    return !this.isTvMuted() ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE; // invert value because it is a fan
  }

  setFanMuteState(state) {
    if (this.isTvOn()) {
      let value = state === Characteristic.Active.ACTIVE;
      this.lgTvCtrl.setMute(!value);
    } else {
      setTimeout(() => {
        this.volumeAsFanService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE);
      }, BUTTON_RESET_TIMEOUT);
    }
  }

  getRotationSpeedVolume() {
    return this.getTvVolume();
  }

  setRotationSpeedVolume(value) {
    if (this.isTvOn()) {
      this.lgTvCtrl.setVolumeLevel(value);
    } else {
      setTimeout(() => {
        this.volumeAsFanService.getCharacteristic(Characteristic.RotationSpeed).updateValue(0);
      }, BUTTON_RESET_TIMEOUT);
    }
  }

  // screen control switch
  getTvScreenState() {
    let isTvScreenOn = false;
    if (this.isTvOn()) {
      isTvScreenOn = this.lgTvCtrl.isTvScreenOn();
    }
    return isTvScreenOn;
  }

  setTvScreenState(state) {
    if (this.isTvOn()) {
      if (state) {
        this.lgTvCtrl.turnOnTvScreen();
      } else {
        this.lgTvCtrl.turnOffTvScreen();
      }
    } else {
      // if tv is off then instantly turn off the switch
      this.turnOffScreenControlButton();
    }
  }

  // screen saver control switch
  getScreenSaverState() {
    let isScreenSaverOn = false;
    if (this.isTvOn()) {
      isScreenSaverOn = this.lgTvCtrl.isScreenSaverActive();
    }
    return isScreenSaverOn;
  }

  setScreenSaverState(state) {
    if (this.isTvOn()) {
      if (state) {
        this.lgTvCtrl.showScreenSaver();
      } else {
        this.lgTvCtrl.hideScreenSaver();
      }
    } else {
      // if tv is off then instantly turn off the switch
      this.turnOffScreenSaverControlButton();
    }
  }

  // app buttons
  getAppButtonState(appId) {
    let appButtonEnabled = false;
    if (this.isTvOn()) {
      appButtonEnabled = this.lgTvCtrl.getForegroundAppAppId() === appId;
    }
    return appButtonEnabled;
  }

  setAppButtonState(state, appButtonDef) {
    if (this.isTvOn()) {
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
    } else if (this.lgTvCtrl) {
      // if TV is off, then try to turn on tv and open the app
      this.lgTvCtrl.turnOnTvAndLaunchApp(appButtonDef.appId, appButtonDef.params);
    }
  }

  // channel buttons
  getChannelButtonState(channelNum) {
    let channelButtonEnabled = false;
    if (this.isTvOn()) {
      channelButtonEnabled = this.lgTvCtrl.getCurrentLiveTvChannelNumber() === channelNum;
    }
    return channelButtonEnabled;
  }

  setChannelButtonState(state, channelButtonDef) {
    if (this.isTvOn()) {
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
    } else if (this.lgTvCtrl) {
      // if TV is off, then try to turn on the tv and set the channel
      this.lgTvCtrl.turnOn().then(() => {
        this.lgTvCtrl.openLiveTvChannel(channelButtonDef.channelNumber, channelButtonDef.channelId);
      })
    }
  }

  // sound output buttons
  getSoundOutputButtonState(soundOutput) {
    let soundOutputButtonEnabled = false;
    if (this.isTvOn()) {
      soundOutputButtonEnabled = this.lgTvCtrl.getActiveSoundOutput() === soundOutput;
    }
    return soundOutputButtonEnabled;
  }

  setSoundOutputButtonState(state, soundOutput) {
    if (this.isTvOn()) {
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
  }

  // backlight
  setLightbulbBacklightOnState(state) {
    // reset only when trying to turn off the switch
    // do nothing when trying to turn on since sliding causes this to be called with state = true
    if (this.isTvOn()) {
      if (!state) {
        this.lgTvCtrl.setBacklight(0);
        setTimeout(() => {
          this.updatePictureSettingsServices();
        }, BUTTON_RESET_TIMEOUT);
      }
    }
  }

  getLightbulbBacklight() {
    let backlight = 0;
    if (this.isTvOn()) {
      backlight = this.lgTvCtrl.getBacklight();
    }
    return backlight;
  }

  setLightbulbBacklight(backlight) {
    if (this.isTvOn()) {
      this.lgTvCtrl.setBacklight(backlight)
    }
  }

  // brightness
  setLightbulbBrightnessOnState(state) {
    // reset only when trying to turn off the switch
    // do nothing when trying to turn on since sliding causes this to be called with state = true
    if (this.isTvOn()) {
      if (!state) {
        this.lgTvCtrl.setBrightness(0);
        setTimeout(() => {
          this.updatePictureSettingsServices();
        }, BUTTON_RESET_TIMEOUT);
      }
    }
  }

  getLightbulbBrightness() {
    let brightness = 0;
    if (this.isTvOn()) {
      brightness = this.lgTvCtrl.getBrightness();
    }
    return brightness;
  }

  setLightbulbBrightness(brightness) {
    if (this.isTvOn()) {
      this.lgTvCtrl.setBrightness(brightness)
    }
  }

  // color
  setLightbulbColorOnState(state) {
    // reset only when trying to turn off the switch
    // do nothing when trying to turn on since sliding causes this to be called with state = true
    if (this.isTvOn()) {
      if (!state) {
        this.lgTvCtrl.setColor(0);
        setTimeout(() => {
          this.updatePictureSettingsServices();
        }, BUTTON_RESET_TIMEOUT);
      }
    }
  }

  getLightbulbColor() {
    let color = 0;
    if (this.isTvOn()) {
      color = this.lgTvCtrl.getColor();
    }
    return color;
  }

  setLightbulbColor(color) {
    if (this.isTvOn()) {
      this.lgTvCtrl.setColor(color)
    }
  }

  // contrast
  setLightbulbContrastOnState(state) {
    // reset only when trying to turn off the switch
    // do nothing when trying to turn on since sliding causes this to be called with state = true
    if (this.isTvOn()) {
      if (!state) {
        this.lgTvCtrl.setContrast(0);
        setTimeout(() => {
          this.updatePictureSettingsServices();
        }, BUTTON_RESET_TIMEOUT);
      }
    }
  }

  getLightbulbContrast() {
    let contrast = 0;
    if (this.isTvOn()) {
      contrast = this.lgTvCtrl.getContrast();
    }
    return contrast;
  }

  setLightbulbContrast(contrast) {
    if (this.isTvOn()) {
      this.lgTvCtrl.setContrast(contrast)
    }
  }

  // sound mode buttons
  getSoundModeButtonState(soundMode) {
    let soundModeButtonEnabled = false;
    if (this.isTvOn()) {
      soundModeButtonEnabled = this.lgTvCtrl.getCurrentSoundMode() === soundMode;
    }
    return soundModeButtonEnabled;
  }

  setSoundModeButtonState(state, soundMode) {
    if (this.isTvOn()) {
      if (state) {
        //disable currently active sound mode button
        this.disableActiveSoundModeButton();

        //change the sound output to the selected one
        this.lgTvCtrl.setSoundMode(soundMode);
      } else {
        // do not allow to turn off the switch,
        setTimeout(() => {
          this.enableActiveSoundModeButton()
        }, BUTTON_RESET_TIMEOUT);
      }
    } else {
      // if TV is off then instantly disable the pressed button
      this.turnOffSoundModeButton(soundMode);
    }
  }

  // occupancy triggers
  getTriggerOccupancyDetected(newTriggerDef) {
    let occupancy = Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED;
    if (this.isTvOn()) {
      let isAboveThreshold = newTriggerDef.actaulValFn() >= newTriggerDef.threshold;
      occupancy = isAboveThreshold ? Characteristic.OccupancyDetected.OCCUPANCY_DETECTED : Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED;
    }
    return occupancy;
  }

  /*----------========== VOLUME/MUTE HELPERS ==========----------*/

  isTvMuted() {
    let isTvMuted = true;
    if (this.isTvOn()) {
      isTvMuted = this.lgTvCtrl.isMuted();
    }
    return isTvMuted;
  }

  getTvVolume() {
    let tvVolume = 0;
    if (this.isTvOn()) {
      tvVolume = this.lgTvCtrl.getVolumeLevel();
    }
    return tvVolume;
  }

  tvVolumeUp() {
    if (this.isTvOn()) {
      this.lgTvCtrl.volumeUp();
    }
  }

  tvVolumeDown() {
    if (this.isTvOn()) {
      this.lgTvCtrl.volumeDown();
    }
  }

  /*----------========== STATUS HELPERS ==========----------*/

  isTvOn() {
    return this.lgTvCtrl && this.lgTvCtrl.isTvOn();
  }

  updatePowerStatus() {
    if (this.tvService) this.tvService.getCharacteristic(Characteristic.Active).updateValue(this.getPowerState());
  }

  updateActiveInputSource() {
    if (this.tvService) this.tvService.getCharacteristic(Characteristic.ActiveIdentifier).updateValue(this.getActiveInputId());
  }

  updateTvAudioStatus() {
    if (this.tvSpeakerService) this.tvSpeakerService.getCharacteristic(Characteristic.Mute).updateValue(this.getMuteState());
    if (this.tvSpeakerService) this.tvSpeakerService.getCharacteristic(Characteristic.Volume).updateValue(this.getVolume());
    if (this.volumeAsLightbulbService) this.volumeAsLightbulbService.getCharacteristic(Characteristic.On).updateValue(this.getLightbulbMuteState());
    if (this.volumeAsLightbulbService) this.volumeAsLightbulbService.getCharacteristic(Characteristic.Brightness).updateValue(this.getLightbulbVolume());
    if (this.volumeAsFanService) this.volumeAsFanService.getCharacteristic(Characteristic.Active).updateValue(this.getFanMuteState());
    if (this.volumeAsFanService) this.volumeAsFanService.getCharacteristic(Characteristic.RotationSpeed).updateValue(this.getRotationSpeedVolume());
  }

  updateAppButtons() {
    if (this.configuredAppButtons) {
      if (this.isTvOn()) {
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
      if (this.isTvOn() && this.lgTvCtrl.isLiveTvActive()) {
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
      if (this.isTvOn()) {
        // tv is on check which sound output is enabled and enable the button if exists
        this.enableActiveSoundOutputButton();
      } else {
        // tv is off, all sound output buttons should be disabled
        this.disableAllSoundOutputButtons();
      }
    }
  }

  updateScreenStatus() {
    if (this.screenControlService) this.screenControlService.getCharacteristic(Characteristic.On).updateValue(this.getTvScreenState());
  }

  updateScreenSaverStatus() {
    if (this.screenSaverControlService) this.screenSaverControlService.getCharacteristic(Characteristic.On).updateValue(this.getScreenSaverState());
  }

  updatePictureSettingsServices() {
    if (this.backlightControlService) this.backlightControlService.getCharacteristic(Characteristic.On).updateValue(this.getPictureSettingsOnState());
    if (this.backlightControlService) this.backlightControlService.getCharacteristic(Characteristic.Brightness).updateValue(this.getLightbulbBacklight());
    if (this.brightnessControlService) this.brightnessControlService.getCharacteristic(Characteristic.On).updateValue(this.getPictureSettingsOnState());
    if (this.brightnessControlService) this.brightnessControlService.getCharacteristic(Characteristic.Brightness).updateValue(this.getLightbulbBrightness());
    if (this.colorControlService) this.colorControlService.getCharacteristic(Characteristic.On).updateValue(this.getPictureSettingsOnState());
    if (this.colorControlService) this.colorControlService.getCharacteristic(Characteristic.Brightness).updateValue(this.getLightbulbColor());
    if (this.contrastControlService) this.contrastControlService.getCharacteristic(Characteristic.On).updateValue(this.getPictureSettingsOnState());
    if (this.contrastControlService) this.contrastControlService.getCharacteristic(Characteristic.Brightness).updateValue(this.getLightbulbContrast());
  }

  updateSoundModeButtons() {
    if (this.configuredSoundModeButtons) {
      if (this.isTvOn()) {
        // tv is on check which sound mode is enabled and enable the button if exists
        this.enableActiveSoundModeButton();
      } else {
        // tv is off, all sound mode buttons should be disabled
        this.disableAllSoundModeButtons();
      }
    }
  }

  updatePictureModeButtons() {
    if (this.configuredPictureModeButtons) {
      if (this.isTvOn()) {
        // tv is on check which picture mode is enabled and enable the button if exists
        this.enableActivePictureModeButton();
      } else {
        // tv is off, all picture mode buttons should be disabled
        this.disableAllPictureModeButtons();
      }
    }
  }

  updateOccupancyTriggers() {
    if (this.volumeTriggerDef) this.volumeTriggerDef.service.getCharacteristic(Characteristic.OccupancyDetected).updateValue(this.getTriggerOccupancyDetected(this.volumeTriggerDef));
    if (this.backlightTriggerDef) this.backlightTriggerDef.service.getCharacteristic(Characteristic.OccupancyDetected).updateValue(this.getTriggerOccupancyDetected(this.backlightTriggerDef));
    if (this.brightnessTriggerDef) this.brightnessTriggerDef.service.getCharacteristic(Characteristic.OccupancyDetected).updateValue(this.getTriggerOccupancyDetected(this.brightnessTriggerDef));
    if (this.colorTriggerDef) this.colorTriggerDef.service.getCharacteristic(Characteristic.OccupancyDetected).updateValue(this.getTriggerOccupancyDetected(this.colorTriggerDef));
    if (this.contrastTriggerDef) this.contrastTriggerDef.service.getCharacteristic(Characteristic.OccupancyDetected).updateValue(this.getTriggerOccupancyDetected(this.contrastTriggerDef));
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
    this.updatePictureSettingsServices();
    this.updateSoundModeButtons();
    this.updatePictureModeButtons()
    this.updateOccupancyTriggers();
  }


  /*----------========== STATEFUL SERVICES HELPERS ==========----------*/

  createStatefulSwitchService(name, id, getterFn, setterFn) {
    let newStatefulSwitchService = new Service.Switch(name, id);
    newStatefulSwitchService
      .getCharacteristic(Characteristic.On)
      .onGet(getterFn.bind(this))
      .onSet(setterFn.bind(this));

    this.setServiceConfiguredName(newStatefulSwitchService, name);
    return newStatefulSwitchService;
  }

  disableActiveStatefulServiceButton(configuredButtons, valueToDisable) {
    if (configuredButtons) {
      let buttonDef = configuredButtons[valueToDisable];
      if (buttonDef) {
        buttonDef.switchService.getCharacteristic(Characteristic.On).updateValue(false);
      }
    }
  }

  enableActiveStatefulServiceButton(configuredButtons, valKey, valueToEnable) {
    if (configuredButtons) {
      Object.entries(configuredButtons).forEach(([key, val]) => {
        let buttonVal = val[valKey];
        if (buttonVal === valueToEnable) {
          val.switchService.getCharacteristic(Characteristic.On).updateValue(true);
        } else {
          val.switchService.getCharacteristic(Characteristic.On).updateValue(false);
        }
      });
    }
  }

  disableAllStatefulServiceButtons(configuredButtons) {
    if (configuredButtons) {
      Object.entries(configuredButtons).forEach(([key, val]) => {
        val.switchService.getCharacteristic(Characteristic.On).updateValue(false);
      });
    }
  }

  turnOffStatefulServiceButton(configuredButtons, valToTurnOff) {
    if (configuredButtons) {
      let buttonDef = configuredButtons[valToTurnOff];
      if (buttonDef) {
        setTimeout(() => {
          buttonDef.switchService.getCharacteristic(Characteristic.On).updateValue(false);
        }, BUTTON_RESET_TIMEOUT);
      }
    }
  }

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
    this.turnOffStatefulServiceButton(this.configuredSoundOutputButtons, soundOutput);
  }

  turnOffSoundModeButton(soundMode) {
    this.turnOffStatefulServiceButton(this.configuredSoundModeButtons, soundMode);
  }

  turnOffPictureModeButton(pictureMode) {
    this.turnOffStatefulServiceButton(this.configuredPictureModeButtons, pictureMode);
  }

  /*----------========== STATELESS SERVICES HELPERS ==========----------*/

  createStatlessSwitchService(name, id, setterFn) {
    let newStatelessSwitchService = new Service.Switch(name, id);
    newStatelessSwitchService
      .getCharacteristic(Characteristic.On)
      .onGet(this.getStatelessSwitchState.bind(this))
      .onSet((state) => {
        setterFn(state);
      });

    this.setServiceConfiguredName(newStatelessSwitchService, name);
    return newStatelessSwitchService;
  }

  getStatelessSwitchState() {
    return false;
  }

  resetStatlessButtons(configuredButtons) {
    if (configuredButtons) {
      setTimeout(() => {
        configuredButtons.forEach((item, i) => {
          item.switchService.getCharacteristic(Characteristic.On).updateValue(false);
        });
      }, BUTTON_RESET_TIMEOUT);
    }
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
    this.resetStatlessButtons(this.configuredNotificationButtons);
  }

  resetRemoteControlButtons() {
    this.resetStatlessButtons(this.configuredRemoteControlButtons);
  }

  resetRemoteSequenceButtons() {
    this.resetStatlessButtons(this.configuredRemoteSequenceButtons);
  }

  resetSystemSettingsButtons() {
    this.resetStatlessButtons(this.configuredSystemSettingsButtons);
  }

  resetServiceMenuButton() {
    setTimeout(() => {
      if (this.serviceMenuButtonService) this.serviceMenuButtonService.getCharacteristic(Characteristic.On).updateValue(false);
    }, BUTTON_RESET_TIMEOUT);
  }

  resetEzAdjustButton() {
    setTimeout(() => {
      if (this.ezAdjustButtonService) this.ezAdjustButtonService.getCharacteristic(Characteristic.On).updateValue(false);
    }, BUTTON_RESET_TIMEOUT);
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
    if (this.isTvOn()) {
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
          val.switchService.getCharacteristic(Characteristic.On).updateValue(false);
        }
      });
    }
  }

  enableActiveAppButton() {
    if (this.configuredAppButtons) {
      Object.entries(this.configuredAppButtons).forEach(([key, val]) => {
        let appId = val.appId;
        if (appId === this.lgTvCtrl.getForegroundAppAppId()) {
          val.switchService.getCharacteristic(Characteristic.On).updateValue(true);
        } else {
          val.switchService.getCharacteristic(Characteristic.On).updateValue(false);
        }
      });
    }
  }

  disableAllAppButtons() {
    if (this.configuredAppButtons) {
      Object.entries(this.configuredAppButtons).forEach(([key, val]) => {
        val.switchService.getCharacteristic(Characteristic.On).updateValue(false);
      });
    }
  }


  /*----------========== CHANNEL BUTTON HELPERS ==========----------*/

  disableActiveChannelButton() {
    this.disableActiveStatefulServiceButton(this.configuredChannelButtons, this.lgTvCtrl.getCurrentLiveTvChannelNumber());
  }

  enableActiveChannelButton() {
    this.enableActiveStatefulServiceButton(this.configuredChannelButtons, 'channelNumber', this.lgTvCtrl.getCurrentLiveTvChannelNumber());
  }

  disableAllChannelButtons() {
    this.disableAllStatefulServiceButtons(this.configuredChannelButtons);
  }


  /*----------========== SOUND OUTPUT BUTTON HELPERS ==========----------*/

  disableActiveSoundOutputButton() {
    this.disableActiveStatefulServiceButton(this.configuredSoundOutputButtons, this.lgTvCtrl.getActiveSoundOutput());
  }

  enableActiveSoundOutputButton() {
    this.enableActiveStatefulServiceButton(this.configuredSoundOutputButtons, 'soundOutput', this.lgTvCtrl.getActiveSoundOutput());
  }

  disableAllSoundOutputButtons() {
    this.disableAllStatefulServiceButtons(this.configuredSoundOutputButtons);
  }

  /*----------========== SOUND MODE BUTTON HELPERS ==========----------*/

  disableActiveSoundModeButton() {
    this.disableActiveStatefulServiceButton(this.configuredSoundModeButtons, this.lgTvCtrl.getCurrentSoundMode());
  }

  enableActiveSoundModeButton() {
    this.enableActiveStatefulServiceButton(this.configuredSoundModeButtons, 'soundMode', this.lgTvCtrl.getCurrentSoundMode());
  }

  disableAllSoundModeButtons() {
    this.disableAllStatefulServiceButtons(this.configuredSoundModeButtons);
  }

  /*----------========== PICTURE MODE BUTTON HELPERS ==========----------*/

  disableActivePictureModeButton() {
    this.disableActiveStatefulServiceButton(this.configuredPictureModeButtons, this.lgTvCtrl.getCurrentPictureMode());
  }

  enableActivePictureModeButton() {
    this.enableActiveStatefulServiceButton(this.configuredPictureModeButtons, 'pictureMode', this.lgTvCtrl.getCurrentPictureMode());
  }

  disableAllPictureModeButtons() {
    this.disableAllStatefulServiceButtons(this.configuredPictureModeButtons);
  }


  /*----------========== PICTURE SETTINGS HELPERS ==========----------*/

  createPictureSettingsLightbulbService(name, id, onSetterFn, setterFn, getterFn) {
    let tmpService = new Service.Lightbulb(name, id);
    tmpService
      .getCharacteristic(Characteristic.On)
      .onGet(this.getPictureSettingsOnState.bind(this))
      .onSet(onSetterFn.bind(this));
    tmpService
      .addCharacteristic(new Characteristic.Brightness())
      .onGet(getterFn.bind(this))
      .onSet(setterFn.bind(this));

    this.setServiceConfiguredName(tmpService, name);
    return tmpService;
  }

  getPictureSettingsOnState() {
    return this.isTvOn();
  }


  /*----------========== CC REMOTE HELPERS ==========----------*/

  getCcRemapCmd(key, defaultCmd) {
    let curAppId = this.lgTvCtrl.getForegroundAppAppId();
    let remoteCmd = this.ccRemoteRemap[key]; // first get the global one
    let appSpecific = this.ccRemoteRemap[curAppId]; // check whether we have app specific
    if (appSpecific && appSpecific[key]) {
      remoteCmd = appSpecific[key]; // if we have app specific the overdefine global one
    }
    return remoteCmd || defaultCmd;
  }


  /*----------========== OCCUPANCY TRIGGERS HELPERS ==========----------*/

  createTriggerOccupancySensor(triggerType, actaulValFn) {
    if (!this.triggers || !this.triggers[triggerType]) {
      return;
    }

    if (!actaulValFn) {
      this.logDebug(`Missing actaul value function for trigger!`);
      return;
    }

    let triggerThreshold = this.triggers[triggerType].threshold;
    let triggerName = this.triggers[triggerType].name;

    if (!triggerThreshold || !Number.isFinite(triggerThreshold)) {
      this.logWarn(`Missing threshold value. Cannot create a ${triggerType} trigger!`);
      return;
    }

    if (triggerThreshold < 0 || triggerThreshold > 100) {
      this.logWarn(`Invalid trigger threshold -> ${triggerThreshold}! The ${triggerType} trigger threshold needs to be in the range 0-100`);
      return;
    }

    // create a new trigger definition
    let newTriggerDef = {};

    if (!triggerName) {
      triggerName = triggerType.charAt(0).toUpperCase() + triggerType.slice(1) + ' Trigger - ' + triggerThreshold;
    }

    newTriggerDef.threshold = triggerThreshold;
    newTriggerDef.actaulValFn = actaulValFn;

    newTriggerDef.service = new Service.OccupancySensor(triggerName, `${triggerType}TriggerService`);
    newTriggerDef.service
      .getCharacteristic(Characteristic.OccupancyDetected)
      .onGet(() => {
        return this.getTriggerOccupancyDetected(newTriggerDef);
      })
    newTriggerDef.service
      .addCharacteristic(Characteristic.StatusActive)
      .onGet(() => {
        return this.isTvOn();
      })

    this.setServiceConfiguredName(newTriggerDef.service, triggerName);
    return newTriggerDef;
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

  setServiceConfiguredName(service, name) {
    if (service) {
      service.addOptionalCharacteristic(Characteristic.ConfiguredName);
      service.setCharacteristic(Characteristic.ConfiguredName, name);
    }
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
