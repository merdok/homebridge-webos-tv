var lgtv, Service, Characteristic;
var wol = require('wake_on_lan');

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
  this.url = 'ws://' + this.ip + ':3000';
  this.connected = false;
  this.checkCount = 0;

  lgtv = require('lgtv2')({
    url: this.url,
    timeout: 5000,
    reconnect: 3000,
    keyFile: '/tmp/webos_key_'
  });
  
  var self = this;
  
  lgtv.on('connect', function() {
    self.log('webOS3 connected to TV');
    self.connected = true;
  });
  
  lgtv.on('close', function() {
    self.log('webOS3 disconnected from TV');
    self.connected = false;
  });
  
  lgtv.on('error', function(error) {
    self.log('webOS3 error %s', error);
    self.connected = false;
    //setTimeout(lgtv.connect(this.url), 5000);
  });
  
  lgtv.on('prompt', function() {
    self.log('webOS3 prompt for confirmation');
    self.connected = false;
  });
  
  lgtv.on('connecting', function() {
    self.log('webOS3 connecting to TV');
    self.connected = false;
  });

  this.service = new Service.Switch(this.name, "powerState");
  this.muteService = new Service.Switch(this.name, "muteState");
  this.volumeService = new Service.Lightbulb(this.name, "volumeState");

  this.service
    .getCharacteristic(Characteristic.On)
    .on('get', this.getState.bind(this))
    .on('set', this.setState.bind(this));
  
   this.muteService
    .getCharacteristic(Characteristic.On)
    .on('get', this.getMuteState.bind(this))
    .on('set', this.setMuteState.bind(this));
  
  	this.volumeService
		.addCharacteristic(new Characteristic.Brightness())
		.on('get', this.getVolume.bind(this))
		.on('set', this.setVolume.bind(this));
  
}

webos3Accessory.prototype.getState = function(callback) {
  this.log('webOS3 TV state: %s', this.connected ? "On" : "Off");
  return callback(null, this.connected);
}

webos3Accessory.prototype.checkWakeOnLan = function(callback) {
  if (this.connected) {
    this.checkCount = 0;
    return callback(null, true);
  } else {
    if (this.checkCount < 3) {
      this.checkCount++;
      lgtv.connect(this.url);
      setTimeout(this.checkWakeOnLan.bind(this, callback), 5000);
    } else {
      return callback(new Error('webOS3 wake timeout'));
      this.checkCount = 0;
    }
  }
}

webos3Accessory.prototype.setState = function(state, callback) {
  if (state) {
    if (!this.connected) {
      var self = this;
      wol.wake(this.mac, function(error) {
        if (error) return callback(new Error('webOS3 wake on lan error'));
        this.checkCount = 0;
        setTimeout(self.checkWakeOnLan.bind(self, callback), 7000);
      })
    } else {
      return callback(null, true);
    }
  } else {
    if (this.connected) {
      var self = this;
      lgtv.request('ssap://system/turnOff', function(err, res) {
        if (err) return callback(null, false);
        lgtv.disconnect();
        self.connected = false ;
        return callback(null, true);
      })
    } else {
      return callback(new Error('LGTv2 is not connected'))
    }
  }
}


webos3Accessory.prototype.getMuteState = function(callback) {
    var self = this;
    lgtv.request('ssap://audio/getStatus', function (err, res) {
      if (!res) return callback(null, false);
      self.log('webOS3 TV muted: %s', res.mute ? "Yes" : "No");   
      callback(null, res.mute);
    });
}

webos3Accessory.prototype.setMuteState = function(state, callback) {
    lgtv.request('ssap://audio/setMute', {mute: state});  
    return callback(null, true);
}

webos3Accessory.prototype.getVolume = function(callback) {
    var self = this;
    lgtv.request('ssap://audio/getVolume', function (err, res) {
      if (!res) return callback(null, false);
      self.log('webOS3 TV volume: ' + res.volume);   
      callback(null, parseInt(res.volume));
    });
}

webos3Accessory.prototype.setVolume = function(level, callback) {
    lgtv.request('ssap://audio/setVolume', {volume: level});  
    return callback(null, level);
}

webos3Accessory.prototype.getServices = function() {
  return [
    this.service,
    this.muteService,
    this.volumeService
  ]
}
