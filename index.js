const lgtv2 = require('lgtv2');
const wol = require('wake_on_lan');
const tcpp = require('tcp-ping');

let Service, Characteristic;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory('homebridge-webos3', 'webos3', webos3Accessory);
}

function webos3Accessory(log, config, api) {
  this.log = log;
  this.ip = config['ip'];
  this.name = config['name'];
  this.mac = config['mac'];
  this.keyFile = config['keyFile'];
  this.volumeControl = config['volumeControl'];
  if(this.volumeControl == undefined){
    this.volumeControl = true;
  }
  this.pollingEnabled = config['pollingEnabled'];
  if(this.pollingEnabled == undefined){
    this.pollingEnabled = false;
  }
  this.alivePollingInterval = config['pollingInterval'] || 5;
  this.alivePollingInterval = this.alivePollingInterval * 1000; 
  this.externalSourceSwitch = config['externalSourceSwitch'];
  this.appSwitch = config['appSwitch'];
  
  this.url = 'ws://' + this.ip + ':3000';
  this.enabledServices = [];
  this.connected = false;
  this.checkCount = 0;
  this.checkAliveInterval = null;

  lgtv = new lgtv2({
    url: this.url,
    timeout: 5000,
    reconnect: 3000,
    keyFile: this.keyFile
  });
  
  lgtv.on('connect', () => {
    this.log('webOS - connected to TV');
    this.connected = true;
    if(!this.checkAliveInterval && this.pollingEnabled) {
      this.checkAliveInterval = setInterval(this.checkTVState.bind(this, this.pollCallback.bind(this)), this.alivePollingInterval);
    }
    lgtv.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', (err, res) => {
      if (res && res.appId){
        this.log('webOS - current appId: %s', res.appId);
      }
     });
     this.updateAccessoryStatus();
  });
  
  lgtv.on('close', () => {
    this.log('webOS - disconnected from TV');
    this.connected = false;
    //if(this.checkAliveInterval) {
    //  clearInterval(this.checkAliveInterval);
    //  this.checkAliveInterval = undefined;
    //}
  });
  
  lgtv.on('error', (error) => {
    this.log('webOS - error %s', error);
    //this.connected = false;
    //setTimeout(lgtv.connect(this.url), 5000);
  });
  
  lgtv.on('prompt', () => {
    this.log('webOS - prompt for confirmation');
    this.connected = false;
  });
  
  lgtv.on('connecting', () => {
    this.log('webOS - connecting to TV');
    this.connected = false;
  });
  
  this.powerService = new Service.Switch(this.name + " Power", "powerService");
  this.volumeService = new Service.Lightbulb(this.name + " Volume" , "volumeService");
  this.externalSourceSwitchService = new Service.Switch(this.name + " Input: " +  this.externalSourceSwitch, "externalSourceSwitchService");
  this.appSwitchService = new Service.Switch(this.name + " App: " +  this.appSwitch, "appSwitchService");
  this.informationService = new Service.AccessoryInformation();

  this.powerService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getState.bind(this))
    .on('set', this.setState.bind(this));
  
   this.volumeService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getMuteState.bind(this))
    .on('set', this.setMuteState.bind(this));
  
  this.volumeService
    .addCharacteristic(new Characteristic.Brightness())
    .on('get', this.getVolume.bind(this))
    .on('set', this.setVolume.bind(this));
  
  this.externalSourceSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getExternalSourceSwitchState.bind(this))
    .on('set', this.setExternalSourceSwitchState.bind(this));
 
  this.appSwitchService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getAppSwitchState.bind(this))
    .on('set', this.setAppSwitchState.bind(this));
  
  this.informationService
    .setCharacteristic(Characteristic.Manufacturer, 'LG Electronics Inc.')
    .setCharacteristic(Characteristic.Model, 'webOS TV')
    .setCharacteristic(Characteristic.SerialNumber, '-')
    .setCharacteristic(Characteristic.FirmwareRevision, '0.9.2');
  
  this.enabledServices.push(this.powerService);
  if(this.volumeControl) this.enabledServices.push(this.volumeService);
  if(this.externalSourceSwitch && this.externalSourceSwitch.length > 0) this.enabledServices.push(this.externalSourceSwitchService);
  if(this.appSwitch && this.appSwitch.length > 0) this.enabledServices.push(this.appSwitchService);
  this.enabledServices.push(this.informationService);
  
}

webos3Accessory.prototype.setMuteStateManuallyCallback = function(error, value) {
  if(this.volumeControl) this.volumeService.getCharacteristic(Characteristic.On).updateValue(value);
}

webos3Accessory.prototype.setExternalSourceSwitchManuallyCallback = function(error, value) {
  if(this.externalSourceSwitch && this.externalSourceSwitch.length > 0)  this.externalSourceSwitchService.getCharacteristic(Characteristic.On).updateValue(value);
}

webos3Accessory.prototype.setAppSwitchManuallyCallback = function(error, value) {
  if(this.appSwitch && this.appSwitch.length > 0) this.appSwitchService.getCharacteristic(Characteristic.On).updateValue(value);
}

webos3Accessory.prototype.updateAccessoryStatus = function() {
     if(this.volumeControl) this.checkMuteState(this.setMuteStateManuallyCallback.bind(this));
     if(this.externalSourceSwitch && this.externalSourceSwitch.length > 0) this.checkExternalInput(this.setExternalSourceSwitchManuallyCallback.bind(this));
     if(this.appSwitch && this.appSwitch.length > 0) this.checkForegroundApp(this.setAppSwitchManuallyCallback.bind(this));
}

webos3Accessory.prototype.pollCallback = function(error, status) {
  if (!status) {
    this.powerService.getCharacteristic(Characteristic.On).updateValue(status);
    this.volumeService.getCharacteristic(Characteristic.On).updateValue(status);
  } else {
    this.powerService.getCharacteristic(Characteristic.On).updateValue(status);
  }
}

webos3Accessory.prototype.checkTVState = function(callback) {
  tcpp.probe(this.ip, 3000, (err, isAlive) => {
    if (!isAlive) {
      this.connected = false;
    } else {
      this.connected = true;
    }
    this.log('webOS - TV state: %s', this.connected ? "On" : "Off");
    callback(null, this.connected);
  });
}

webos3Accessory.prototype.checkMuteState = function(callback) {
    if (this.connected) {
      lgtv.request('ssap://audio/getStatus', (err, res) => {
        if (!res || err){
          callback(new Error('webOS - TV mute check - error while getting current mute state'));
        }else{
          this.log('webOS - TV muted: %s', res.mute ? "Yes" : "No");   
          callback(null, !res.mute);
        }
      });
    }else{
      callback(null, false);
    }
}

webos3Accessory.prototype.checkVolumeLevel = function(callback) {
    if (this.connected) {
      lgtv.request('ssap://audio/getVolume', (err, res) => {
        if (!res || err){
          callback(new Error('webOS - TV volume - error while getting current volume'));
        }else{
          this.log('webOS - TV volume: ' + res.volume);   
          callback(null, parseInt(res.volume));
        }
      });
    }else{
      callback(null, false);
    }
}

webos3Accessory.prototype.checkExternalInput = function(callback) {
    if (this.connected) {
      lgtv.request('ssap://com.webos.applicationManager/getForegroundAppInfo', (err, res) => {
        if (!res || err){
          callback(new Error('webOS - external input - error while getting external input info'));
        }else{
          this.log('webOS - TV current appId: %s', res.appId); 
          if(res.appId.includes('com.webos.app.externalinput')){
            callback(null, true);
          }else {
            callback(null, false);
          }
        }
      });
    }else{
      callback(null, false);
    }
}

webos3Accessory.prototype.checkForegroundApp = function(callback) {
    if (this.connected) {
      lgtv.request('ssap://com.webos.applicationManager/getForegroundAppInfo', (err, res) => {
        if (!res || err){
          callback(new Error('webOS - external input - error while getting external input info'));
        }else{
          this.log('webOS - TV current appId: %s', res.appId); 
          if(res.appId === this.appSwitch){
            callback(null, true);
          }else {
            callback(null, false);
          }
        }
      });
    }else{
      callback(null, false);
    }
}

webos3Accessory.prototype.checkWakeOnLan = function(callback) {
  if (this.connected) {
    this.checkCount = 0;
    callback(null, true);
  } else {
    if (this.checkCount < 3) {
      this.checkCount++;
      lgtv.connect(this.url);
      setTimeout(this.checkWakeOnLan.bind(this, callback), 5000);
    } else {
      this.checkCount = 0;
      callback(new Error('webOS - wake timeout'));
    }
  }
}

webos3Accessory.prototype.getState = function(callback) {
  lgtv.connect(this.url);
  this.checkTVState.call(this, callback);
}

webos3Accessory.prototype.setState = function(state, callback) {
  if (state) {
    if (!this.connected) {
      wol.wake(this.mac, (error) => {
        if (error) return callback(new Error('webOS - wake on lan error'));
        this.checkCount = 0;
        setTimeout(this.checkWakeOnLan.bind(this, callback), 5000);
      })
    } else {
      callback(null, true);
    }
  } else {
    if (this.connected) {
      lgtv.request('ssap://system/turnOff', (err, res) => {
        if (err) return callback(null, false);
        lgtv.disconnect();
        this.connected = false ;
        this.volumeService.getCharacteristic(Characteristic.On).updateValue(false);
        this.externalSourceSwitchService.getCharacteristic(Characteristic.On).updateValue(false);
        this.appSwitchService.getCharacteristic(Characteristic.On).updateValue(false);
        callback(null, true);
      })
    } else {
      callback(new Error('webOS - is not connected'))
    }
  }
}


webos3Accessory.prototype.getMuteState = function(callback) {
    setTimeout(this.checkMuteState.bind(this, callback), 50);
}

webos3Accessory.prototype.setMuteState = function(state, callback) {
    if (this.connected) {
      lgtv.request('ssap://audio/setMute', {mute: !state});  
      callback(null, state);
    }else {
      callback(new Error('webOS - is not connected'))
    }
}


webos3Accessory.prototype.getVolume = function(callback) {
    setTimeout(this.checkVolumeLevel.bind(this, callback), 50);
}

webos3Accessory.prototype.setVolume = function(level, callback) {
    if (this.connected) {
      lgtv.request('ssap://audio/setVolume', {volume: level});  
      callback(null, level);
     }else {
      callback(new Error('webOS - is not connected'))
    }
}

webos3Accessory.prototype.getExternalSourceSwitchState = function(callback) {
  if(this.connected == false){
     callback(null, false);
  }else {
    setTimeout(this.checkExternalInput.bind(this, callback), 50);
  }
}

webos3Accessory.prototype.setExternalSourceSwitchState = function(state, callback) {
    if (this.connected) {
      if(state){
        lgtv.request('ssap://tv/switchInput', {inputId: this.externalSourceSwitch}); 
        this.setAppSwitchManuallyCallback(null, false);
      }else {
        lgtv.request('ssap://system.launcher/launch', {id: "com.webos.app.livetv"});  
      }
      callback(null, state);
    }else {
      callback(new Error('webOS - is not connected'))
    }
}

webos3Accessory.prototype.getAppSwitchState = function(callback) {
  if(this.connected == false){
     callback(null, false);
  }else {
    setTimeout(this.checkForegroundApp.bind(this, callback), 50);
  }
}

webos3Accessory.prototype.setAppSwitchState = function(state, callback) {
    if (this.connected) {
      if(state){
        lgtv.request('ssap://system.launcher/launch', {id: this.appSwitch});
        this.setExternalSourceSwitchManuallyCallback(null, false);
      }else {
        lgtv.request('ssap://system.launcher/launch', {id: "com.webos.app.livetv"});  
      }
      callback(null, state);
    }else {
      callback(new Error('webOS - is not connected'))
    }
}

webos3Accessory.prototype.getServices = function() {
  return this.enabledServices;
}

