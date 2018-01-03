# homebridge-webos3

`homebridge-webos3` is a plugin for HomeBridge which allows you to control your webOS3 TV! It should also work with webOS2 TVs.
The idea is that the TV should be controlled completely from the native HomeKit iOS app and Siri, that is why volume appears as a light bulb.

### IMPORTANT

This is a work in progress. Please contribute!_

### Features
* Power status
* Turn on / off
* Mute Status (currently as light bulb)
* Mute / Unmute (currently as light bulb)
* Volume control (currently as light bulb)

## Installation

If you are new to Homebridge, please first read the Homebridge [documentation](https://www.npmjs.com/package/homebridge).
If you are running on a Raspberry, you will find a tutorial in the [homebridge-punt Wiki](https://github.com/cflurin/homebridge-punt/wiki/Running-Homebridge-on-a-Raspberry-Pi).

Install homebridge:
```sh
sudo npm install -g homebridge
```

Install homebridge-webos3:
```sh
sudo npm install -g homebridge-webos3
```

## Configuration

Add the accessory in `config.json` in your home directory inside `.homebridge`.

```js
{
  "accessories": [
    {
      "accessory": "webos3",
      "name": "My webOS tv",
      "ip": "192.168.0.40",
      "mac": "ab:cd:ef:fe:dc:ba"
    }
  ]  
}
```

You also need to enable "mobile tv on" on your tv for the turn on feature to work correctly.

### Configuration fields
- `accessory` [required]
Should always be "webos3"
- `name` [required]
Name of your accessory
- `ip` [required]
ip address of your tv
- `mac` [required]
Mac address of your tv
- `keyFile` [optional]
Location to store permission token for your tv
- `pollingEnabled` [optional]
Wheter the TV state background polling is enabled. Useful for more accurate TV state awareness and HomeKit automation. Default: false
- `pollingInterval` [optional]
The TV state background polling interval in seconds. **Default: 5**
- `volumeControl` [optional]
Wheter the volume service is enabled. **Default: true**

## Special thanks
[lgtv2](https://github.com/hobbyquaker/lgtv2) - the Node.js remote control module for LG WebOS smart TVs.

[homebridge-lgtv2](https://github.com/alessiodionisi/homebridge-lgtv2) & [homebridge-webos2](https://github.com/zwerch/homebridge-webos2) - the basic idea for the plugin.
