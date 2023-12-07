import LGTV from './ws/weboswebsocket.js';
import * as wol from 'wake_on_lan';
import * as tcpp from 'tcp-ping';
import { EventEmitter } from 'node:events';
import Events from './Events.js';

// General constants
const TV_WEBSOCKET_PORT = 3000;
const TV_WEBSOCKET_SSL_PORT = 3001;
const AUTO_PROMISE_RESOLVE_TIMEOUT = 5000;
const LIVE_TV_SUBSCRIBE_DELAY = 2000;
const WEBOS_LIVE_TV_APP_ID = 'com.webos.app.livetv';
const WEBOS_YOUTUBE_APP_ID = 'youtube.leanback.v4';
const WEBOS_NETFLIX_APP_ID = 'netflix';
const WEBOS_AMAZON_APP_ID = 'amazon';
const WEBOS_AIRPLAY_APP_ID = 'airplay';
const WEBOS_FACTORY_SETUP_APP_ID = 'com.webos.app.factorywin';

// TV action constants
const WEBOS_URI_TURN_OFF = 'ssap://system/turnOff'; // params: -
const WEBOS_URI_SET_VOLUME = 'ssap://audio/setVolume'; // params: volumeLevel
const WEBOS_URI_SET_MUTE = 'ssap://audio/setMute'; // params: mute
const WEBOS_URI_VOLUME_UP = 'ssap://audio/volumeUp'; // params: -
const WEBOS_URI_VOLUME_DOWN = 'ssap://audio/volumeDown'; // params: -
const WEBOS_URI_CHANGE_SOUND_OUTPUT = 'ssap://audio/changeSoundOutput'; // params: output
const WEBOS_URI_OPEN_CHANNEL = 'ssap://tv/openChannel'; // params: output
const WEBOS_URI_CHANNEL_UP = 'ssap://tv/channelUp'; // params: -
const WEBOS_URI_CHANNEL_DOWN = 'ssap://tv/channelDown'; // params: -
const WEBOS_URI_SWITCH_INPUT = 'ssap://tv/switchInput'; // params: inputId
const WEBOS_URI_TURN_OFF_SCREEN = 'ssap://com.webos.service.tv.power/turnOffScreen'; // params: standbyMode (active or passive[passive cannot turn screen back on])
const WEBOS_URI_TURN_ON_SCREEN = 'ssap://com.webos.service.tv.power/turnOnScreen'; // params: standbyMode (active or passive[passive cannot turn screen back on])
const WEBOS_URI_TURN_OFF_SCREEN_ALT = 'ssap://com.webos.service.tvpower/power/turnOffScreen'; // alternative version, probably for webOS5+ TVs, accepts the same params as above
const WEBOS_URI_TURN_ON_SCREEN_ALT = 'ssap://com.webos.service.tvpower/power/turnOnScreen'; // alternative version, probably for webOS5+ TVs, accepts the same params as above
const WEBOS_URI_LAUNCH_APP = 'ssap://com.webos.applicationManager/launch'; // params: id, params
const WEBOS_URI_OPEN_APP = 'ssap://com.webos.applicationManager/open'; // params: id
const WEBOS_URI_CLOSE_APP = 'ssap://com.webos.applicationManager/close'; // params: id
const WEBOS_URI_PLAY = 'ssap://media.controls/play'; // params: -
const WEBOS_URI_PAUSE = 'ssap://media.controls/pause'; // params: -
const WEBOS_URI_STOP = 'ssap://media.controls/stop'; // params: -
const WEBOS_URI_REWIND = 'ssap://media.controls/rewind'; // params: -
const WEBOS_URI_FAST_FORWARD = 'ssap://media.controls/fastForward'; // params: -
const WEBOS_URI_CREATE_TOAST = 'ssap://system.notifications/createToast'; // params: message, iconData, iconExtension, onClick[appId, params]
const WEBOS_URI_CLOSE_TOAST = 'ssap://system.notifications/closeToast'; // params: toastId
const WEBOS_URI_CREATE_ALERT = 'ssap://system.notifications/createAlert'; // params: title, message, modal, buttons, onclose[uri, params], type,isSysReq || buttons - label, focus, buttonType, onClick [luna uri], params
const WEBOS_URI_CLOSE_ALERT = 'ssap://system.notifications/closeAlert'; // params: alertId

// TV information constants
const WEBOS_URI_AUDIO_STATUS = 'ssap://audio/getStatus';
const WEBOS_URI_POWER_STATE = 'ssap://com.webos.service.tvpower/power/getPowerState';
const WEBOS_URI_SYSTEM_INFO = 'ssap://system/getSystemInfo';
const WEBOS_URI_SW_INFO = 'ssap://com.webos.service.update/getCurrentSWInformation';
const WEBOS_URI_SERVICE_LIST = 'ssap://api/getServiceList';
const WEBOS_URI_LAUNCH_POINTS = 'ssap://com.webos.applicationManager/listLaunchPoints';
const WEBOS_URI_LIST_APPS = 'ssap://com.webos.applicationManager/listApps';
const WEBOS_URI_EXTERNAL_INPUT_LIST = 'ssap://tv/getExternalInputList';
const WEBOS_URI_CHANNEL_LIST = 'ssap://tv/getChannelList';
const WEBOS_URI_FOREGROUND_APP_INFO = 'ssap://com.webos.applicationManager/getForegroundAppInfo';
const WEBOS_URI_CURRENT_CHANNEL = 'ssap://tv/getCurrentChannel';
const WEBOS_URI_SOUND_OUPUT = 'ssap://com.webos.service.apiadapter/audio/getSoundOutput';
const WEBOS_URI_SYSTEM_SETTINGS = 'ssap://settings/getSystemSettings';

// TV remote input socket constants
const WEBOS_URI_REMOTE_POINTER_SOCKET_INPUT = 'ssap://com.webos.service.networkinput/getPointerInputSocket';

// TV remote command list
const REMOTE_COMMANDS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "LIST", "AD", "DASH", "MUTE", "VOLUMEUP", "VOLUMEDOWN", "CHANNELUP", "CHANNELDOWN", "HOME", "MENU", "UP", "DOWN", "LEFT", "RIGHT", "CLICK", "BACK", "EXIT", "PROGRAM", "ENTER", "INFO", "RED", "GREEN", "YELLOW", "BLUE", "LIVE_ZOOM", "CC", "PLAY", "PAUSE", "REWIND", "FASTFORWARD", "POWER", "FAVORITES", "RECORD", "FLASHBACK", "QMENU", "GOTOPREV", "GOTONEXT", "3D_MODE", "SAP", "ASPECT_RATIO", "EJECT", "MYAPPS", "RECENT", "BS", "BS_NUM_1", "BS_NUM_2", "BS_NUM_3", "BS_NUM_4", "BS_NUM_5", "BS_NUM_6", "BS_NUM_7", "BS_NUM_8", "BS_NUM_9", "BS_NUM_10", "BS_NUM_11", "BS_NUM_12", "CS1", "CS1_NUM_1", "CS1_NUM_2", "CS1_NUM_3", "CS1_NUM_4", "CS1_NUM_5", "CS1_NUM_6", "CS1_NUM_7", "CS1_NUM_8", "CS1_NUM_9", "CS1_NUM_10", "CS1_NUM_11", "CS1_NUM_12", "CS2", "CS2_NUM_1", "CS2_NUM_2", "CS2_NUM_3", "CS2_NUM_4", "CS2_NUM_5", "CS2_NUM_6", "CS2_NUM_7", "CS2_NUM_8", "CS2_NUM_9", "CS2_NUM_10", "CS2_NUM_11", "CS2_NUM_12", "TER", "TER_NUM_1", "TER_NUM_2", "TER_NUM_3", "TER_NUM_4", "TER_NUM_5", "TER_NUM_6", "TER_NUM_7", "TER_NUM_8", "TER_NUM_9", "TER_NUM_10", "TER_NUM_11", "TER_NUM_12", "3DIGIT_INPUT", "BML_DATA", "JAPAN_DISPLAY", "TELETEXT", "TEXTOPTION", "MAGNIFIER_ZOOM", "SCREEN_REMOT"];

//nice to haves:
//TODO: Subscription for tv screen turn on or off? // did not find anything yet
//TODO: Subscription for play/pause of the content? tried already ssap://system.launcher/getAppState - not working... or maybe something missing
//TODO: When screen is off and user switches channel or changes foreground app, turn on screen automatically then? right now user has to use home app to turen on the screen or turn off tv
//TODO: monitor smart speaker accessory development, would be good for play/pause and volume control? currently not working with homebridge
//TODO: checkBasicInputs - find a better and proper way to get those inputs on webos 4.5 and higher

class LgTvController extends EventEmitter {
  constructor(ip, mac, name, keyFile, broadcastAdr, reconnect, log) {
    super();

    // config
    this.ip = ip;
    this.mac = mac;
    this.broadcastAdr = broadcastAdr;
    this.keyFile = keyFile;
    this.name = name || 'webOS TV';
    this.reconnect = reconnect || 5000;
    this.log = log || console;
    this.deepDebugLog = false;
    this.silentLog = false;

    // reconnect should be specified in miliseconds, if the value is less then 1000 then assume that it is in seconds so multiply it by 1000 to make it miliseconds
    if (this.reconnect < 1000) {
      this.reconnect = this.reconnect * 1000;
    }

    // basic variables
    this.url = 'ws://' + this.ip + ':' + TV_WEBSOCKET_PORT;
    this.secureUrl = 'wss://' + this.ip + ':' + TV_WEBSOCKET_SSL_PORT;
    this.useSsl = false;
    this.connected = false;
    this.pointerInputSocket = null;

    // tv STUFF
    this.prepareTvVariables();

    // tv settings
    this.volumeLimit = 100;
  }

  /*----------========== SETUP ==========----------*/

  prepareTvVariables() {
    this.systemInfo = null;
    this.swInfo = null;
    this.webOsVersion = 0;
    this.serviceList = null;
    this.launchPointsList = [];
    this.allApps = [];
    this.externalInputList = [];
    this.channelList = []; // not used
    this.powerState = null;
    this.volume = 0;
    this.muted = false;
    this.foregroundApp = null;
    this.currentLiveTvChannel = null;
    this.activeSoundOutput = null;
    this.tvOn = false;
    this.mediaPaused = false; // internal property to keep track if media is paused on tv (only works if the home app remote control is used)
    this.isScreenOn = true; // internal property to keep track if the screen is turned off or on, is there an event from the tv which can tell me that instead?
    this.pictureMode = null; // internal property to keep track of the active picture mode. There is no way at the moment to retrieve the active picture mode from the TV
    this.pictureSettings = {};
    this.soundSettings = {};
  }

  connect() {
    if (this.connected === false) {
      if (!this.lgtv) {
        this.setupLgtvInstance(); // also does the initial connection
      } else {
        this.lgtv.connect(this.useSsl ? this.secureUrl : this.url);
      }
    }
  }

  disconnect() {
    this.lgtv.disconnect();
    this.connected = false;
    this.prepareTvVariables();

    // start the reconnecting, after the specified polling interval time and only if still not connected
    setTimeout(() => {
      if (this.connected === false) {
        this.logInfo('Starting TV alive polling');
        this.connect();
      }
    }, this.reconnect);
  }

  setupLgtvInstance() {
    // create the lgtv instance
    this.lgtv = new LGTV({
      url: this.url,
      timeout: 5000,
      reconnect: this.reconnect,
      keyFile: this.keyFile
    });

    //register to listeners
    this.lgtv.on('connect', () => {
      if (this.connected === false) {
        this.logInfo('Connected to TV');
        this.connected = true;
        this.setupTvConnection();
      }
    });

    this.lgtv.on('close', () => {
      this.logInfo('Disconnected from TV');
      this.disconnect();

      // webos 2.x fallback
      if (this.webOs2xFallbackCheckAliveInterval) {
        this.webOs2xTvDisconnected();
      }
    });

    this.lgtv.on('error', (error) => {
      this.logDeepDebug('Error - %s', error);
      if (error.code === 'ECONNRESET' && !this.useSsl) {
        this.logDebug('Connection was reset! Possibly SSL is required!');
        this.logDebug('Trying again with ssl enabled...');
        this.useSsl = true;
        this.connect();
      } else {
        this.useSsl = false;
      }
    });

    this.lgtv.on('prompt', () => {
      this.logInfo('Prompt for confirmation. Please accept the pairing request on the TV!');
      this.connected = false;
    });

    this.lgtv.on('connecting', () => {
      this.logDebug('Connecting to TV');
      this.connected = false;
    });

    this.lgtv.on('message', (message) => {
      this.logDeepDebug('Message from TV \n');
      this.logDeepDebug('', message);
    });
  }

  setupTvConnection() {
    this.getTvInformation().then(() => {
      this.logInfo('Got TV information');
      this.extractWebOsVersion();
      let webOsVer = this.getWebOsVersion() > 0 ? this.getWebOsVersion().toFixed(1) : 'Unknown';
      this.logInfo(`TV webOS version: ${webOsVer}`);
      this.checkBasicInputs(); // webos 4.5 is mising some basic inputs so make sure that they are present
      this.subscribeToServices().then(() => {
        this.logInfo('Subscribed to TV services');
        this.connectToPointerInputSocket().then(() => {
          //All good!
          this.logInfo('Connected to remote pointer input socket');
          this.logInfo('Setup finished');
          this.emit(Events.SETUP_FINISHED);
        }).catch((error) => {
          //Handle the eror gracefully
          this.logDebug(error);
          this.logInfo('Setup finished with remote input socket error! Remote control emulation will not be possible!');
          this.emit(Events.SETUP_FINISHED);
        });;
      });
    });
  }

  /*----------========== TV INFORMATION ==========----------*/

  async getTvInformation() {
    this.logDebug('Requesting TV information');

    let tvInfoPromises = [];

    tvInfoPromises.push(this.getSystemInfo().then((res) => {
      this.logDebug('Retrieved system info');
      this.systemInfo = res;
    }));

    tvInfoPromises.push(this.getSWInfo().then((res) => {
      this.logDebug('Retrieved SW info');
      this.swInfo = res;
    }));

    tvInfoPromises.push(this.getServiceList().then((res) => {
      this.logDebug('Retrieved service list');
      this.serviceList = res;
    }));

    tvInfoPromises.push(this.getLaunchPoints().then((res) => {
      if (res && res.launchPoints && Array.isArray(res.launchPoints)) {
        this.launchPointsList = this.parseLaunchPoints(res.launchPoints);
        this.logDebug('Retrieved launch points (inputs, apps)');
        this.logDeepDebug(JSON.stringify(this.launchPointsList, null, 2));
      } else {
        this.logDebug('Error while retrieving the launch point list \n' + JSON.stringify(res, null, 2));
      }
    }));

    tvInfoPromises.push(this.getExternalInputs().then((res) => {
      if (res && res.devices && Array.isArray(res.devices)) {
        this.externalInputList = this.parseExternalInputs(res.devices);
        this.logDebug('Retrieved external input list');
        this.logDeepDebug(JSON.stringify(this.externalInputList, null, 2));
      } else {
        this.logDebug('Error while retrieving the external input list \n' + JSON.stringify(res, null, 2));
      }
    }));

    tvInfoPromises.push(this.getAllApps().then((res) => {
      if (res && res.apps && Array.isArray(res.apps)) {
        this.allApps = this.parseApps(res.apps);
        this.logDebug('Retrieved all apps');
        this.logDeepDebug(JSON.stringify(this.allApps, null, 2));
      } else {
        this.logDebug('Error while retrieving all apps list \n' + JSON.stringify(res, null, 2));
      }
    }));

    await Promise.allSettled(tvInfoPromises);
  }

  /*----------========== SERVICES SUBSCRIPTION ==========----------*/

  async subscribeToServices() {
    this.logDebug('Subscribing to TV services');

    let subscribePromises = [];

    // power status
    subscribePromises.push(this.subscribeToPowerStatusChange());

    // audio status
    subscribePromises.push(this.subscribeToAudioStatusChange());

    // foreground app info
    subscribePromises.push(this.subscribeToForegroundAppChange());

    // current channel
    subscribePromises.push(this.subscribeToChannelChange());

    // sound output
    subscribePromises.push(this.subscribeToSoundOutputChange());

    // subscribe to launch points list change
    subscribePromises.push(this.subscribeToLaunchPointsListChange());

    // subscribe to picture settings change
    subscribePromises.push(this.subscribeToPictureSettingsChange());

    // subscribe to sound settings change
    subscribePromises.push(this.subscribeToSoundSettingsChange());

    await Promise.allSettled(subscribePromises);
  }

  async subscribeToPowerStatusChange() {
    return this.tvSubscribe(WEBOS_URI_POWER_STATE, null, (err, res) => {
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

      this.logDebug(`TV power status changed, status: ${powerState}`);

      this.powerState = res;

      let tvPowerState = this.checkTvPowerState();
      if (tvPowerState === 'On' && this.isTvOn() === false) {
        this.tvOn = true;
        this.isScreenOn = true;
        this.logInfo(`TV turned on!`);
        this.emit(Events.TV_TURNED_ON, res);
      } else if (tvPowerState === 'Off') {
        this.tvOn = false;
        this.isScreenOn = false;
        this.logInfo(`TV turned off!`);
        this.emit(Events.TV_TURNED_OFF, res);
      } else if (tvPowerState === 'Pixel Refresher') {
        this.tvOn = false;
        this.isScreenOn = false;
        this.logInfo(`Pixel refresher started!`);
        this.emit(Events.PIXEL_REFRESHER_STARTED, res);
      } else if (tvPowerState === 'Screen On') {
        this.logInfo(`Screen turned on!`);
        this.isScreenOn = true;
        this.emit(Events.SCREEN_STATE_CHANGED, res);
      } else if (tvPowerState === 'Screen Off') {
        this.logInfo(`Screen turned off!`);
        this.isScreenOn = false;
        this.emit(Events.SCREEN_STATE_CHANGED, res);
      } else if (tvPowerState === 'Screen Saver') {
        this.logInfo(`Screen saver started!`);
        this.emit(Events.SCREEN_SAVER_TURNED_ON, res);
      } else if (statusState && !statusProcessing) {
        // something regarding power state changed, so notifiy listeners, only when nothing is processing
        this.emit(Events.POWER_STATE_CHANGED, res);
      }

    }).catch((error) => {
      this.logDebug(`Failed to subscribe to the Power State service. The configured TV most probably does not support that service. Falling back to tcp ping!`);
      this.webOs2xStateFallback();
    });
  }

  async subscribeToAudioStatusChange() {
    return this.tvSubscribe(WEBOS_URI_AUDIO_STATUS, null, (err, res) => {
      this.logDebug(`Audio status changed. Current volume: ${res.volume}, Muted: ${res.mute ? 'Yes' : 'No'}`);

      // check if volumeUp or volumeDown was pressed and emit an event
      // holds volumeUp or volumeDown if one of those was pressed or is not present if not
      let statusCause = (res && res.cause ? res.cause : null);
      if (statusCause) {
        // here VOLUME_UP or VOLUME_DOWN events are emitted
        this.emit(statusCause);
      }

      if (res.volume > this.volumeLimit) {
        this.logInfo('Volume limit reached!');
        this.setVolumeLevel(this.volumeLimit);
        return;
      }

      // volume state
      this.volume = res.volume;

      // mute state
      this.muted = res.mute;

      this.emit(Events.AUDIO_STATUS_CHANGED, res);
    }).catch((error) => {
      this.logDebug(error);
    });
  }

  async subscribeToForegroundAppChange() {
    return this.tvSubscribe(WEBOS_URI_FOREGROUND_APP_INFO, null, (err, res) => {
      if (res && res.appId && res.appId.length > 0) {
        this.logInfo(`App launched, current appId: ${res.appId}`);
        this.foregroundApp = res;
        // if we were not subscribed to the channel service try to do it when switching to live tv
        // the subscription to current channel only works when live tv is on
        if (this.foregroundApp.appId === WEBOS_LIVE_TV_APP_ID && !this.currentLiveTvChannel) {
          setTimeout(() => this.subscribeToChannelChange(), LIVE_TV_SUBSCRIBE_DELAY); // short delay as it for some reason does not work instantly
        }

        this.emit(Events.FOREGROUND_APP_CHANGED, res);
      }
    }).catch((error) => {
      this.logDebug(error);
    });
  }

  async subscribeToChannelChange() {
    return this.tvSubscribe(WEBOS_URI_CURRENT_CHANNEL, null, (err, res) => {
      if (!res || err || res.errorCode) {
        this.currentLiveTvChannel = null; // error occurred, usually happens when no live tv is running when trying to subscribe
      } else {
        if (this.getCurrentLiveTvChannelId() !== res.channelId) {
          this.logInfo(`Channel changed. Current channel: ${res.channelNumber}, ${res.channelName}, channelId: ${res.channelId}`);
          this.currentLiveTvChannel = res;

          this.emit(Events.LIVE_TV_CHANNEL_CHANGED, res);
        }
      }
    }).catch((error) => {
      this.currentLiveTvChannel = null;
      this.logDebug(`Failed to subscribe to the channel service. It seems Live TV is not running, will retry after switching to Live TV.`);
    });
  }

  async subscribeToSoundOutputChange() {
    return this.tvSubscribe(WEBOS_URI_SOUND_OUPUT, null, (err, res) => {
      if (this.activeSoundOutput !== res.soundOutput) {
        this.logInfo(`Sound output changed. Current sound output: ${res.soundOutput}`);
        this.activeSoundOutput = res.soundOutput;

        this.emit(Events.SOUND_OUTPUT_CHANGED, res);
      }
    }).catch((error) => {
      this.logDebug(error);
    });
  }

  async subscribeToLaunchPointsListChange() {
    return this.tvSubscribe(WEBOS_URI_LAUNCH_POINTS, null, (err, res) => {
      if (res && res.launchPoints && Array.isArray(res.launchPoints)) {
        this.launchPointsList = this.parseLaunchPoints(res.launchPoints);
        this.checkBasicInputs(); // webos 4.5 is mising some basic inputs so make sure that they are present
        this.logDebug(`Got new launch points list from tv!`);
      } else if (res && res.change) {
        let inputInfo = {};
        inputInfo.appId = res.id;
        inputInfo.name = res.title;

        if (res.change === 'added' && res.id !== WEBOS_AIRPLAY_APP_ID) {
          this.logDebug(`New app installed on the TV! app: ${res.title} appId: ${res.id}`);
          this.emit(Events.NEW_APP_ADDED, inputInfo);
        }

        if (res.change === 'removed' && res.id !== WEBOS_AIRPLAY_APP_ID) {
          this.logDebug(`App removed from TV! app: ${res.title} appId: ${res.id}`);
          this.emit(Events.APP_REMOVED, inputInfo);
        }

        this.logDeepDebug(JSON.stringify(res, null, 2));
      }
    }).catch((error) => {
      this.logDebug(error);
    });
  }

  async subscribeToPictureSettingsChange() {
    let payload = {
      category: "picture",
      keys: ["brightness", "backlight", "contrast", "color"]
    }
    return this.tvSubscribe(WEBOS_URI_SYSTEM_SETTINGS, payload, (err, res) => {
      if (res && res.settings) {
        if (res.settings.brightness !== undefined) {
          this.pictureSettings.brightness = parseInt(res.settings.brightness);
        }

        if (res.settings.backlight !== undefined) {
          this.pictureSettings.backlight = parseInt(res.settings.backlight);
        }

        if (res.settings.contrast !== undefined) {
          this.pictureSettings.contrast = parseInt(res.settings.contrast);
        }

        if (res.settings.color !== undefined) {
          this.pictureSettings.color = parseInt(res.settings.color);
        }
        this.logDebug(`Picture settings changed. Current picture settings: ${ JSON.stringify(this.pictureSettings)}`);
        this.emit(Events.PICTURE_SETTINGS_CHANGED, this.pictureSettings);
      }
    }).catch((error) => {
      this.logDebug(error);
    });
  }

  async subscribeToSoundSettingsChange() {
    let payload = {
      category: "sound",
      keys: ["soundMode"]
    }
    return this.tvSubscribe(WEBOS_URI_SYSTEM_SETTINGS, payload, (err, res) => {
      if (res && res.settings) {
        if (res.settings.soundMode !== undefined) {
          this.soundSettings.soundMode = res.settings.soundMode;
        }
        this.logDebug(`Sound settings changed. Current sound settings: ${ JSON.stringify(this.soundSettings)}`);
        this.emit(Events.SOUND_SETTINGS_CHANGED, this.soundSettings);
      }
    }).catch((error) => {
      this.logDebug(error);
    });
  }

  /*----------========== TV INPUT SOCKET ==========----------*/

  async connectToPointerInputSocket() {
    this.logDebug('Connecting to remote input socket');
    return new Promise((resolve, reject) => {
      this.lgtv.getSocket(WEBOS_URI_REMOTE_POINTER_SOCKET_INPUT, (err, sock) => {
        if (!err) {
          this.pointerInputSocket = sock;
          resolve();
        } else {
          reject(`Remote control socket error - ${err}`);
        }
      });
    });
  }

  /*----------========== TV INFORMATION ==========----------*/

  isTvOn() {
    if (this.connected === true) {
      return this.tvOn;
    }
    return false;
  }

  isPixelRefresherRunning() {
    if (this.checkTvPowerState() === 'Pixel Refresher') {
      return true;
    }
    return false;
  }

  isScreenSaverActive() {
    if (this.checkTvPowerState() === 'Screen Saver') {
      return true;
    }
    return false;
  }

  isTvScreenOn() {
    if (this.isTvOn() === true) {
      return this.isScreenOn;
    }
    return false;
  }

  getCurrentLiveTvChannelNumber() {
    if (this.isLiveTvActive() && this.currentLiveTvChannel && this.currentLiveTvChannel.channelNumber) {
      return this.currentLiveTvChannel.channelNumber;
    }
    return 0;
  }

  getCurrentLiveTvChannelId() {
    if (this.isLiveTvActive() && this.currentLiveTvChannel && this.currentLiveTvChannel.channelId) {
      return this.currentLiveTvChannel.channelId;
    }
    return null;
  }

  getCurrentLiveTvChannelName() {
    if (this.isLiveTvActive() && this.currentLiveTvChannel && this.currentLiveTvChannel.channelName) {
      return this.currentLiveTvChannel.channelName;
    }
    return null;
  }

  getForegroundAppAppId() {
    if (this.foregroundApp && this.foregroundApp.appId && this.foregroundApp.appId.length > 0) {
      return this.foregroundApp.appId;
    }
    return null;
  }

  getActiveSoundOutput() {
    if (this.activeSoundOutput) {
      return this.activeSoundOutput;
    }
    return null;
  }

  getVolumeLevel() {
    return this.volume < 0 ? 0 : this.volume;
  }

  isMuted() {
    return this.muted;
  }

  getTvSystemInfo() {
    return this.systemInfo;
  }

  getTvSwInfo() {
    return this.swInfo;
  }

  isMediaPaused() {
    return this.mediaPaused;
  }

  getExternalInputList() {
    return this.externalInputList;
  }

  getLaunchPointsList() {
    return this.launchPointsList;
  }

  getAllAppsList() {
    return this.allApps;
  }

  getLiveTvAppId() {
    return WEBOS_LIVE_TV_APP_ID;
  }

  isLiveTvActive() {
    return this.getForegroundAppAppId() === WEBOS_LIVE_TV_APP_ID;
  }

  getWebOsVersion() {
    return this.webOsVersion;
  }

  // picture settings
  getBrightness() {
    return this.pictureSettings.brightness || 0;
  }

  getBacklight() {
    return this.pictureSettings.backlight || 0;
  }

  getContrast() {
    return this.pictureSettings.contrast || 0;
  }

  getColor() {
    return this.pictureSettings.color || 0;
  }

  // sound mode
  getCurrentSoundMode() {
    if (this.soundSettings && this.soundSettings.soundMode) {
      return this.soundSettings.soundMode;
    }
    return null;
  }

  getCurrentPictureMode() {
    return this.pictureMode
  }

  /*----------========== TV WEBSOCKET HELPERS ==========----------*/

  async tvRequest(methodUri, payload = {}, dbgMsg = '') {
    if (methodUri) {
      let urlComponents = methodUri.split('/');
      let method = urlComponents[urlComponents.length - 1];
      let service = urlComponents[urlComponents.length - 2];
      if (this.connected) {
        return new Promise((resolve, reject) => {
          this.logDebug(`${service} service - ${method} requested. ${dbgMsg}`);
          this.lgtv.request(methodUri, payload, (err, res) => {
            if (!res || err || res.errorCode || res.errorText || !res.returnValue) {
              if (res && Object.keys(res).length > 0) {
                reject(`Request failed. Error text: ${ res.errorText}, Error code: ${ res.errorCode}`);
              } else {
                reject(`Unknown error while requesting ${method} from service ${service}`);
              }
            } else {
              this.logDeepDebugTvResponse(res); // log the Tv response
              delete res['returnValue']; // we do not need the return value
              resolve(res);
            }
          });
        }).catch((error) => {
          this.logDebug(error);
        });
      } else {
        this.logDebug(`TV not connected - cannot fire ${method} from service ${service}!`);
      }
    }
  }

  async tvSubscribe(methodUri, payload = {}, callback) {
    if (methodUri) {
      let urlComponents = methodUri.split('/');
      let method = urlComponents[urlComponents.length - 1];
      let service = urlComponents[urlComponents.length - 2];
      if (this.connected) {
        // create the subscribe promise
        let tvSubscribePromise = new Promise((resolve, reject) => {
          this.logDebug(`Subscribing to ${method} from ${service} service.`);
          this.lgtv.subscribe(methodUri, payload, (err, res) => {
            if (!res || Object.keys(res).length == 0 || err || res.errorCode || res.errorText) {
              if (res && Object.keys(res).length > 0) {
                reject(`Could not subscribe to ${method} from service ${service}. Error text: ${ res.errorText}, Error code: ${ res.errorCode}`);
              } else {
                reject(`Unknown error while subscribing to ${method} from service ${service}`);
              }
            } else {
              this.logDeepDebugTvResponse(res); // log the Tv response
              delete res['returnValue']; // we do not need the return value
              callback(err, res);
              //this resolve should actaully only be called on first time (this subscrition calls it each time somehting changes), but it maks no issue to call it multiply time so it is ok
              resolve(res);
            }
          });
        });
        // create a timeout promise
        let timeoutPromise = new Promise((resolve, reject) => {
          setTimeout(() => reject(`Timed out while subscribing to ${method} from service ${service}`), AUTO_PROMISE_RESOLVE_TIMEOUT * 2);
        });
        // we are doing a promise race here, whichever promise settles first wins
        return Promise.race([
          tvSubscribePromise,
          timeoutPromise
        ]);
      } else {
        this.logDebug(`TV not connected - cannot subscribe to ${method} from service ${service}!`);
        resolve();
      }
    }
  }

  /*----------========== TV INFORMATION ==========----------*/

  async getSystemInfo() {
    return this.tvRequest(WEBOS_URI_SYSTEM_INFO);
  }

  async getSWInfo() {
    return this.tvRequest(WEBOS_URI_SW_INFO);
  }

  async getServiceList() {
    return this.tvRequest(WEBOS_URI_SERVICE_LIST);
  }

  async getLaunchPoints() {
    return this.tvRequest(WEBOS_URI_LAUNCH_POINTS);
  }

  async getAllApps() {
    return this.tvRequest(WEBOS_URI_LIST_APPS);
  }

  async getExternalInputs() {
    return this.tvRequest(WEBOS_URI_EXTERNAL_INPUT_LIST);
  }

  async getChannelList() {
    return this.tvRequest(WEBOS_URI_CHANNEL_LIST);
  }

  async getAudioStatus() {
    return this.tvRequest(WEBOS_URI_AUDIO_STATUS);
  }

  async getPowerState() {
    return this.tvRequest(WEBOS_URI_POWER_STATE);
  }

  async getForegroundAppInfo() {
    return this.tvRequest(WEBOS_URI_FOREGROUND_APP_INFO);
  }

  async getCurrentChannel() {
    return this.tvRequest(WEBOS_URI_CURRENT_CHANNEL);
  }

  async getSoundOutput() {
    return this.tvRequest(WEBOS_URI_SOUND_OUPUT);
  }

  async getSettingsPicture() {
    return this.tvRequest(WEBOS_URI_SYSTEM_SETTINGS, {
      category: "picture",
      keys: ["brightness", "backlight", "contrast", "color"]
    });
  }

  async getSettingsSound() {
    return this.tvRequest(WEBOS_URI_SYSTEM_SETTINGS, {
      category: "sound",
      keys: ["soundMode"]
    });
  }

  async getSettingsTwinTv() {
    return this.tvRequest(WEBOS_URI_SYSTEM_SETTINGS, {
      category: "twinTv",
      keys: ["status", "role", "systemMode"]
    });
  }

  async getSettingsNetwork() {
    return this.tvRequest(WEBOS_URI_SYSTEM_SETTINGS, {
      category: "network",
      keys: ["deviceName"]
    });
  }

  async getSettingsOption() {
    return this.tvRequest(WEBOS_URI_SYSTEM_SETTINGS, {
      category: "option",
      keys: ["audioGuidance"]
    });
  }

  async getSettingsTime() {
    return this.tvRequest(WEBOS_URI_SYSTEM_SETTINGS, {
      category: "time",
      keys: ["onTimerVolume"]
    });
  }


  /*----------========== TV CONTROL ==========----------*/

  async turnOn() {
    wol.wake(this.mac, {
      'address': this.broadcastAdr
    }, (error) => {
      if (error) {
        this.logDebug('Wake on LAN error! Could not turn on TV!');
        return;
      }
      this.logDebug(`Wake on LAN callback - sent magic packet, trying to connect to tv...`);
      this.logDeepDebug(`Trying to wake up TV! Mac: ${this.mac}, BroadcastAdr: ${ this.broadcastAdr}`);
      if (this.connected === false) {
        this.connect();
      }
    });
    return new Promise((resolve, reject) => {
      setTimeout(resolve, Math.max(AUTO_PROMISE_RESOLVE_TIMEOUT * 6, this.reconnect)); //backup, turn on takes longer to process so auto resolve after 30 seconds or at least the choosen reconnect time
      this.once(Events.TV_TURNED_ON, resolve)
    })
  }

  async turnOff() {
    this.tvRequest(WEBOS_URI_TURN_OFF, {}, ``);
    return new Promise((resolve, reject) => {
      setTimeout(resolve, AUTO_PROMISE_RESOLVE_TIMEOUT * 6); //backup, also auto resolve after 30 seconds when turning off since it might take longer
      this.once(Events.TV_TURNED_OFF, resolve)
    })
  }

  setTvPowerState(state) {
    if (state === true && this.isTvOn() === false) {
      this.turnOn();
    } else if (state === false && this.isTvOn() === true) {
      this.turnOff();
    }
  }

  // ---------

  setMute(isMuted) {
    let payload = {
      mute: isMuted
    };
    this.tvRequest(WEBOS_URI_SET_MUTE, payload, `Action: ${isMuted ? 'Mute' : 'Unmute'}`);
  }

  async setVolumeLevel(volumeLevel) {
    let payload = {
      volume: volumeLevel
    };
    return this.tvRequest(WEBOS_URI_SET_VOLUME, payload, `Volume: ${volumeLevel}, Volume limit: ${this.volumeLimit}`);
  }

  volumeUp() {
    if (this.volume < this.volumeLimit) {
      this.tvRequest(WEBOS_URI_VOLUME_UP, {}, ``);
    } else {
      this.logInfo('Volume limit reached!');
    }
  }

  volumeDown() {
    this.tvRequest(WEBOS_URI_VOLUME_DOWN, {}, ``);
  }

  changeSoundOutput(soundOutput) {
    let payload = {
      output: soundOutput
    };
    this.tvRequest(WEBOS_URI_CHANGE_SOUND_OUTPUT, payload, `Changing sound output to: ${soundOutput}`);
  }

  // ---------

  openLiveTvChannel(channelNumber, channelId) {
    channelNumber = channelNumber ? channelNumber.toString() : null;
    // if both channel number and channel id are specified, then the channelId is always used to switch channel
    let payload = {
      channelNumber: channelNumber, // must be string
      channelId: channelId
    };
    this.tvRequest(WEBOS_URI_OPEN_CHANNEL, payload, `Channel number: ${channelNumber}, Channel Id: ${channelId}`);
  }

  channelUp() {
    this.tvRequest(WEBOS_URI_CHANNEL_UP, {}, ``);
  }

  channelDown() {
    this.tvRequest(WEBOS_URI_CHANNEL_DOWN, {}, ``);
  }

  switchInput(inputId) {
    let payload = {
      inputId: inputId
    };
    this.tvRequest(WEBOS_URI_SWITCH_INPUT, payload, `Changing input to: ${inputId}`);
  }

  // open the specified channel, if live tv not active then the live tv app will be opned first
  switchToLiveTvAndOpenChannel(channelNumber, channelId) {
    if (this.isLiveTvActive() === true) {
      this.openLiveTvChannel(channelNumber, channelId);
    } else {
      this.openLiveTv().then(() => {
        this.openLiveTvChannel(channelNumber, channelId);
      })
    }
  }

  // ---------

  turnOffTvScreen() {
    // possible standbyMode values 'active' and 'passive', passive stay on even when TV is turned off, do not know yet how to get out of that mode - currentyl need to pull tv plug
    let endpointOff = this.getWebOsVersion() >= 5 ? WEBOS_URI_TURN_OFF_SCREEN_ALT : WEBOS_URI_TURN_OFF_SCREEN;
    let payload = {
      standbyMode: 'active'
    };
    this.tvRequest(endpointOff, payload, ``).then(() => {
      this.isScreenOn = false;
    });
  }

  turnOnTvScreen() {
    // possible standbyMode values 'active' and 'passive', passive stay on even when TV is turned off, do not know yet how to get out of that mode - currentyl need to pull tv plug
    let endpointOn = this.getWebOsVersion() >= 5 ? WEBOS_URI_TURN_ON_SCREEN_ALT : WEBOS_URI_TURN_ON_SCREEN;
    let payload = {
      standbyMode: 'active'
    };
    this.tvRequest(endpointOn, payload, ``).then(() => {
      this.isScreenOn = true;
    });
  }

  // ---------

  async launchApp(appId, params = {}) {
    if (appId && appId.length > 0) {
      let payload = {
        id: appId,
        params: params
      };
      return this.tvRequest(WEBOS_URI_LAUNCH_APP, payload, `AppId: ${appId}, Params: ${JSON.stringify(params)}`);
    } else {
      this.logDebug(`Missing or invalid appId. Cannot launch app on the tv! AppId: ${appId}, Params: ${JSON.stringify(params)}`);
    }
  }

  // turn on the tv, and launch the application
  turnOnTvAndLaunchApp(appId, params = {}) {
    if (this.isTvOn() === true) {
      this.launchApp(appId, params);
    } else {
      this.turnOn().then(() => {
        this.launchApp(appId, params);
      })
    }
  }

  // openApp does not accept params so better to use launchApp
  async openApp(appId) {
    if (appId && appId.length > 0) {
      let payload = {
        id: appId
      };
      return this.tvRequest(WEBOS_URI_OPEN_APP, payload, `AppId: ${appId}`);
    } else {
      this.logDebug(`Missing or invalid appId. Cannot open app on the tv! AppId: ${appId}`);
    }
  }

  //TODO: does not work, 403 error is comming back, check out what is the issue?
  closeApp(appId) {
    if (appId && appId.length > 0) {
      let payload = {
        id: appId
      };
      this.tvRequest(WEBOS_URI_CLOSE_APP, payload, `AppId: ${appId}`);
    } else {
      this.logDebug(`Missing or invalid appId. Cannot close app on the tv! AppId: ${appId}`);
    }
  }

  openYouTubeVideoId(youtubeId) {
    if (youtubeId && youtubeId.length > 0) {
      let youtubeUrl = 'https://www.youtube.com/tv?v=' + youtubeId;
      this.launchApp(WEBOS_YOUTUBE_APP_ID, {
        'contentTarget': youtubeUrl
      });
    } else {
      this.logDebug(`Missing or invalid youtube content id. Cannot open youtube video! YouTube video id: ${youtubeId}`);
    }
  }

  //netflix instead of params uses that: "contentId": `m=http://api.netflix.com/catalog/titles/movies/80145130&source_type=4`
  openNetflixContent(contentId) {
    if (contentId && contentId.length > 0) {
      this.launchApp(WEBOS_NETFLIX_APP_ID, {
        'contentTarget': contentId
      });
    } else {
      this.logDebug(`Missing or invalid netflix content id. Cannot open netflix content! Netflix content id: ${contentId}`);
    }
  }

  openAmazonContent(contentId) {
    if (contentId && contentId.length > 0) {
      this.launchApp(WEBOS_AMAZON_APP_ID, {
        'contentTarget': contentId
      });
    } else {
      this.logDebug(`Missing or invalid amazon content id. Cannot open amazon content! Amazon content id: ${contentId}`);
    }
  }

  async openLiveTv() {
    this.launchApp(WEBOS_LIVE_TV_APP_ID);
    return new Promise((resolve, reject) => {
      setTimeout(resolve, AUTO_PROMISE_RESOLVE_TIMEOUT); //backup, auto resolve the promise after 5 sec, just in case the event gets stuck!
      this.once(Events.FOREGROUND_APP_CHANGED, resolve)
    })
  }

  async openServiceMenu() {
    return this.launchApp(WEBOS_FACTORY_SETUP_APP_ID, {
      id: "executeFactory",
      irKey: "inStart"
    });
  }

  async openEzAdjust() {
    return this.launchApp(WEBOS_FACTORY_SETUP_APP_ID, {
      id: "executeFactory",
      irKey: "ezAdjust"
    });
  }

  // ---------

  //TODO: check if i can get the media status from tv, like is it currently paused or playing? getAppInfo?

  mediaPlay() {
    this.tvRequest(WEBOS_URI_PLAY, {}, ``);
  }

  mediaPause() {
    this.tvRequest(WEBOS_URI_PAUSE, {}, ``);
  }

  mediaStop() {
    this.tvRequest(WEBOS_URI_STOP, {}, ``);
  }

  mediaRewind() {
    this.tvRequest(WEBOS_URI_REWIND, {}, ``);
  }

  mediaFastForward() {
    this.tvRequest(WEBOS_URI_FAST_FORWARD, {}, ``);
  }

  // ---------

  async openToast(message, iconData, iconExtension, onClick) {
    let payload = {
      message: message,
      iconData: iconData,
      iconExtension: iconExtension,
      onClick: onClick // object: 'appId' and 'params'
    };
    return this.tvRequest(WEBOS_URI_CREATE_TOAST, payload, `Message: ${message}, Icon extension: ${iconExtension}, onClick: ${onClick}`);
  }

  closeToast(toastId) {
    let payload = {
      toastId: toastId
    };
    this.tvRequest(WEBOS_URI_CLOSE_TOAST, payload, `Toast id: ${toastId}`);
  }

  async openAlert(title, message, modal = false, buttons, onclose, onfail, type = 'confirm', isSysReq = true) {
    buttons = buttons || [{
      label: 'Ok',
      focus: true,
      buttonType: 'ok', // 'ok' or 'cancel'
      onClick: '',
      params: {}
    }];

    let payload = {
      title: title,
      message: message,
      modal: modal,
      buttons: buttons,
      onclose: onclose, // object: 'uri' and 'params'
      onfail: onfail, // object: 'uri' and 'params'
      type: type, // 'confirm' or 'warning'
      isSysReq: isSysReq
    };
    return this.tvRequest(WEBOS_URI_CREATE_ALERT, payload, `Title: ${title}, Message: ${message}, Type: ${type}, Modal: ${modal}`);
  }

  closeAlert(alertId) {
    let payload = {
      alertId: alertId
    };
    this.tvRequest(WEBOS_URI_CLOSE_ALERT, payload, `Alert id: ${alertId}`);
  }

  // ---------

  lunaSend(lunaService, params = {}) {
    let buttons = [{
      label: 'Ok',
      focus: true,
      buttonType: 'ok', // 'ok' or 'cancel'
      onClick: lunaService,
      params: params
    }];
    let onClose = {
      uri: lunaService,
      params: params
    };
    let onFail = {
      uri: lunaService,
      params: params
    };
    return this.openAlert('lunaSend', 'lunaSend', true, buttons, onClose, onFail, 'confirm', true).then((res) => {
      if (res && res.alertId && this.getWebOsVersion() >= 4) {
        this.closeAlert(res.alertId); // seems that the close alert service is only available on webos4 or higher
      } else {
        // seems like for older webos TVs below 4.0 the popup needs to be opened two times, so repeat the alert opening
        this.openAlert('lunaSend', 'lunaSend', true, buttons, onClose, onFail, 'confirm', true).then((res) => {
          this.sendRemoteInputSocketCommand('ENTER');
        })
      }
    })
  }


  /*----------========== CUSTOM ACTIONS ==========----------*/

  showScreenSaver() {
    this.lunaSend('luna://com.webos.service.tvpower/power/turnOnScreenSaver', {});
  }

  hideScreenSaver() {
    this.sendRemoteInputSocketCommand('EXIT');
  }

  setSystemSettings(category, settings) {
    /*
    Possible categories: picture
    */
    let payload = {
      category: category,
      settings: settings
    };
    this.lunaSend('luna://com.webos.settingsservice/setSystemSettings', payload);
  }

  setPictureSettings(settings) {
    /*
    Possible values:

    "adjustingLuminance": [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
           "backlight": "80",
           "blackLevel": {
               "ntsc": "auto",
               "ntsc443": "auto",
               "pal": "auto",
               "pal60": "auto",
               "palm": "auto",
               "paln": "auto",
               "secam": "auto",
               "unknown": "auto"
           },
           "brightness": "50",
           "color": "50",
           "colorFilter": "off",
           "colorGamut": "auto",
           "colorManagementColorSystem": "red",
           "colorManagementHueBlue": "0",
           "colorManagementHueCyan": "0",
           "colorManagementHueGreen": "0",
           "colorManagementHueMagenta": "0",
           "colorManagementHueRed": "0",
           "colorManagementHueYellow": "0",
           "colorManagementLuminanceBlue": "0",
           "colorManagementLuminanceCyan": "0",
           "colorManagementLuminanceGreen": "0",
           "colorManagementLuminanceMagenta": "0",
           "colorManagementLuminanceRed": "0",
           "colorManagementLuminanceYellow": "0",
           "colorManagementSaturationBlue": "0",
           "colorManagementSaturationCyan": "0",
           "colorManagementSaturationGreen": "0",
           "colorManagementSaturationMagenta": "0",
           "colorManagementSaturationRed": "0",
           "colorManagementSaturationYellow": "0",
           "colorTemperature": "0",
           "contrast": "80",
           "dynamicColor": "off",
           "dynamicContrast": "off",
           "edgeEnhancer": "on",
           "expertPattern": "off",
           "externalPqlDbType": "none",
           "gamma": "high2",
           "grassColor": "0",
           "hPosition": "0",
           "hSharpness": "10",
           "hSize": "0",
           "hdrDynamicToneMapping": "on",
           "hdrLevel": "medium",
           "localDimming": "medium",
           "motionEyeCare": "off",
           "motionPro": "off",
           "mpegNoiseReduction": "off",
           "noiseReduction": "off",
           "realCinema": "on",
           "sharpness": "10",
           "skinColor": "0",
           "skyColor": "0",
           "superResolution": "off",
           "tint": "0",
           "truMotionBlur": "10",
           "truMotionJudder": "0",
           "truMotionMode": "user",
           "vPosition": "0",
           "vSharpness": "10",
           "vSize": "0",
           "whiteBalanceApplyAllInputs": "off",
           "whiteBalanceBlue": [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
           "whiteBalanceBlueGain": "0",
           "whiteBalanceBlueOffset": "0",
           "whiteBalanceCodeValue": "19",
           "whiteBalanceColorTemperature": "warm2",
           "whiteBalanceGreen": [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
           "whiteBalanceGreenGain": "0",
           "whiteBalanceGreenOffset": "0",
           "whiteBalanceIre": "100",
           "whiteBalanceLuminance": "130",
           "whiteBalanceMethod": "2",
           "whiteBalancePattern": "outer",
           "whiteBalancePoint": "high",
           "whiteBalanceRed": [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
           "whiteBalanceRedGain": "0",
           "whiteBalanceRedOffset": "0",
           "xvycc": "auto"
    */
    this.setSystemSettings("picture", settings);
  }

  setPictureMode(pictureMode) {
    /*
    Available picture modes (not all are available on all TVs):
    cinema, eco, expert1, expert2, game, normal, photo, sports, technicolor,
    vivid, hdrEffect,  hdrCinema, hdrCinemaBright, hdrExternal, hdrGame,
    hdrStandard, hdrTechnicolor, hdrVivid, dolbyHdrCinema,dolbyHdrCinemaBright,
    dolbyHdrDarkAmazon, dolbyHdrGame, dolbyHdrStandard, dolbyHdrVivid, dolbyStandard
    */
    let settings = {
      pictureMode: pictureMode
    }
    this.pictureMode = pictureMode
    this.setPictureSettings(settings);
  }

  setBacklight(backlight) {
    let settings = {
      backlight: backlight
    }
    this.setPictureSettings(settings);
  }

  setBrightness(brightness) {
    let settings = {
      brightness: brightness
    }
    this.setPictureSettings(settings);
  }

  setColor(color) {
    let settings = {
      color: color
    }
    this.setPictureSettings(settings);
  }

  setContrast(contrast) {
    let settings = {
      contrast: contrast
    }
    this.setPictureSettings(settings);
  }

  setSoundSettings(settings) {
    this.setSystemSettings("sound", settings);
  }

  setSoundMode(soundMode) {
    /*
    Available sound modes (not all are available on all TVs):
    aiSoundPlus, standard, movie, news, sports, music, game
    */
    let settings = {
      soundMode: soundMode
    }
    this.setSoundSettings(settings);
  }

  /*----------========== POINTER INPUT SOCKET ==========----------*/

  sendRemoteInputSocketCommand(cmd) {
    if (this.connected && this.pointerInputSocket) {
      if (cmd && cmd.length > 0) {
        if (REMOTE_COMMANDS.includes(cmd)) {
          this.logDebug(`Remote input socket - sending command: ${cmd}`);
          if (cmd === 'CLICK') {
            this.pointerInputSocket.send('click');
          } else {
            this.pointerInputSocket.send('button', {
              name: cmd
            });
          }
        } else {
          this.logDebug(`Remote input socket - command does not exist!`);
        }
      } else {
        this.logDebug(`Remote input socket - missing command!`);
      }
    } else {
      this.logDebug(`Remote input socket - tv not connected or remote input socket not established!`);
    }
  }

  sendPlayPause() {
    if (this.mediaPaused) {
      this.sendRemoteInputSocketCommand('PLAY');
    } else {
      this.sendRemoteInputSocketCommand('PAUSE');
    }
    this.mediaPaused = !this.mediaPaused;
  }


  /*----------========== TV SETTINGS ==========----------*/

  setVolumeLimit(volumeLimit) {
    this.volumeLimit = volumeLimit;
  }


  /*----------========== HELPERS ==========----------*/

  checkTvPowerState() {
    if (!this.powerState) {
      return 'Off';
    }

    if (this.powerState.state && this.powerState.state === 'Suspend' && !this.powerState.processing) {
      return 'Off';
    }

    if (this.powerState.processing && this.powerState.processing === 'Request Suspend') {
      return 'Off';
    }

    if (this.powerState.state && this.powerState.state === 'Active Standby' && !this.powerState.processing) {
      return 'Pixel Refresher';
    }

    if (this.powerState.state && this.powerState.state === 'Screen Saver' && !this.powerState.processing) {
      return 'Screen Saver';
    }

    if (this.powerState.state && this.powerState.state === 'Screen Off' && this.powerState.processing && this.powerState.processing === 'Screen On') {
      return 'Screen On';
    }

    if (this.powerState.state && this.powerState.state === 'Screen Off' && !this.powerState.processing) {
      return 'Screen Off';
    }

    if (this.powerState.state && this.powerState.state === 'Active' && !this.powerState.processing) {
      return 'On';
    }

    return 'Unknown';
  }

  parseLaunchPoints(launchPoints) {
    let tmpArray = [];
    for (let launchPoint of launchPoints) {
      let newObj = {};
      newObj.appId = launchPoint.id;
      newObj.name = launchPoint.title;
      tmpArray.push(newObj);
    }
    tmpArray.sort((a, b) => (a.name > b.name) ? 1 : -1); // sort the launch points alphabetically
    return tmpArray;
  }

  parseExternalInputs(externalInputs) {
    let tmpArray = [];
    for (let externalInput of externalInputs) {
      let newObj = {};
      newObj.id = externalInput.id;
      newObj.appId = externalInput.appId;
      newObj.name = externalInput.label;
      newObj.subList = externalInput.subList;
      tmpArray.push(newObj);
    }
    tmpArray.sort((a, b) => (a.name > b.name) ? 1 : -1); // sort the external inputs alphabetically
    return tmpArray;
  }

  parseApps(apps) {
    let tmpArray = [];
    for (let app of apps) {
      let newObj = {};
      newObj.appId = app.id;
      newObj.name = app.title;
      newObj.defaultWindowType = app.defaultWindowType; // "card" seems to be a fullscreen app?
      tmpArray.push(newObj);
    }
    tmpArray.sort((a, b) => (a.name > b.name) ? 1 : -1); // sort the apps alphabetically
    return tmpArray;
  }

  parseChannels(channels) {
    let tmpArray = [];
    for (let channelInfo of channels) {
      let newObj = {};
      if (channelInfo.Radio == false) { // skip radio stations
        newObj.channelId = channelInfo.channelId;
        newObj.channelNumber = channelInfo.channelNumber;
        newObj.name = channelInfo.channelName;
        tmpArray.push(newObj);
      }
    }
    return tmpArray;
  }

  checkBasicInputs() {
    // since webos4.5 live Tv and external inputs are not included in the launch points list anymore since the apps have visibility set to false
    // for that reason i need to check if the launch points list have them

    // live tv, get the live tv from the app list
    if (this.getLaunchPointsList().some(app => app.appId === WEBOS_LIVE_TV_APP_ID) === false) {
      this.logDeepDebug(`Live TV app is missing in the launch points list, adding it manually!`);
      let liveTvApp = this.getAllAppsList().find(app => app.appId === WEBOS_LIVE_TV_APP_ID);
      if (liveTvApp) {
        let newApp = {};
        newApp.appId = liveTvApp.appId;
        newApp.name = liveTvApp.name;
        this.launchPointsList.push(newApp);
      }
    }

    // external inputs
    this.getExternalInputList().forEach((externalInput, i) => {
      if (this.getLaunchPointsList().some(app => app.appId === externalInput.appId) === false) {
        this.logDeepDebug(`Input ${externalInput.appId} is missing in the launch points list, adding it manually!`);
        let newApp = {};
        newApp.appId = externalInput.appId;
        newApp.name = externalInput.name;
        this.launchPointsList.push(newApp);
      }
    });
  }

  extractWebOsVersion() {
    if (this.swInfo && this.swInfo.product_name) {
      let matchedNumbers = this.swInfo.product_name.match(/[0-9.]+/g);
      if (matchedNumbers && matchedNumbers.length > 0) {
        let parsedwebOsVerNum = parseFloat(matchedNumbers[0]);
        if (isNaN(parsedwebOsVerNum)) {
          this.webOsVersion = 0;
        } else {
          this.webOsVersion = parsedwebOsVerNum;
        }
      }
    }
  }


  /*----------========== WEBOS 2x TV STATE ==========----------*/

  webOs2xTvTurnedOn() {
    // set status
    this.tvOn = true;
    this.isScreenOn = true;
    // inform listeners
    this.logInfo(`TV turned on!`);
    this.emit(Events.TV_TURNED_ON, {});
  }

  webOs2xTvTurnedOff() {
    // set status
    this.tvOn = false;
    this.isScreenOn = false;
    // inform listeners
    this.logInfo(`TV turned off!`);
    this.emit(Events.TV_TURNED_OFF, {});
  }

  webOs2xTvDisconnected() {
    this.webOs2xTvTurnedOff();
    // stop the interval
    clearInterval(this.webOs2xFallbackCheckAliveInterval);
    this.webOs2xFallbackCheckAliveInterval = null;
  }

  webOs2xStateFallback() {
    // webOS 2.x TVs does not have the powerState service, for this reason do a tcp ping to check if the TV is connected

    // start the polling
    if (!this.webOs2xFallbackCheckAliveInterval) {
      this.webOs2xFallbackCheckAliveInterval = setInterval(this.webOs2xStateFallback.bind(this), Math.min(4000, this.reconnect / 2)); // at least 2 seconds polling
    }

    tcpp.probe(this.ip, TV_WEBSOCKET_PORT, (err, isAlive) => {
      if (!isAlive && this.isTvOn()) {
        this.webOs2xTvTurnedOff();
      } else if (isAlive && !this.isTvOn()) {
        this.webOs2xTvTurnedOn();
      }
    });
  }


  /*----------========== TESTS ==========----------*/

  testToast() {
    this.openToast('Test toast', null, null, {
      'appId': WEBOS_YOUTUBE_APP_ID
    }).then((res) => {
      this.logDebug(`Toast success: ${res.toastId}`);
    })
  }

  testAlert() {
    let buttons = [{
        'label': 'Ok',
        'focus': true,
        'buttonType': 'ok',
      },
      {
        'label': 'Screen Saver',
        'buttonType': 'ok',
        'onClick': 'luna://com.webos.service.tvpower/power/turnOnScreenSaver',
        'params': {}
      },
      {
        'label': 'Cancel',
        'buttonType': 'cancel',
        'onClick': 'luna://com.webos.service.applicationmanager/launch',
        'params': {
          'id': 'amazon'
        }
      }
    ];
    let result = this.openAlert('Alert title', 'Test alert', true, buttons, {
      'uri': 'luna://com.webos.service.tvpower/power/turnOnScreenSaver'
    }, {}, 'confirm', true).then((res) => {
      this.logDebug(`Alert success: ${res.alertId}`);
      this.sendRemoteInputSocketCommand('ENTER');
    })
  }


  /*----------========== LOG ==========----------*/

  setDeepDebugLogEnabled(enabled = false) {
    this.deepDebugLog = enabled;
  }

  isDeepDebugLogEnabled() {
    return this.deepDebugLog;
  }

  setSilentLogEnabled(enabled = false) {
    this.silentLog = enabled;
  }

  isSilentLogEnabled() {
    return this.silentLog;
  }

  // basic
  logInfo(message, ...args) {
    if (!this.isSilentLogEnabled()) {
      this.log.info(`[${this.name}] ` + message, ...args);
    } else {
      this.logDebug(message, ...args);
    }
  }

  logWarn(message, ...args) {
    this.log.warn(`[${this.name}] ` + message, ...args);
  }

  logDebug(message, ...args) {
    this.log.debug(`[${this.name}] ` + message, ...args);
  }

  logError(message, ...args) {
    this.log.error(`[${this.name}] ` + message, ...args);
  }

  // extended
  logDeepDebug(message, ...args) {
    if (this.isDeepDebugLogEnabled() === true) {
      this.logDebug(message, ...args)
    }
  }

  logDeepDebugTvResponse(res) {
    if (res) {
      this.logDeepDebug(JSON.stringify(res, null, 2));
    } else {
      this.logDeepDebug('TV response missing!');
    }
  }


}

export default LgTvController;
