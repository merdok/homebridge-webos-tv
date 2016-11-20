# homebridge-webos3

`homebridge-webos3` is a plugin for HomeBridge which allows you to control your webOS3 TV! It should also work with webOS2 TVs.

### IMPORTANT

This is a work in progress. Currently not available in npm, needs to be installed manually. _Please contribute!_

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

Copy over this package contents to your node_modules directory. 

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

## Special thanks
[lgtv2](https://github.com/hobbyquaker/lgtv2) - the Node.js remote control module for LG WebOS smart TVs.

[homebridge-lgtv2](https://github.com/alessiodionisi/homebridge-lgtv2) & [homebridge-webos2](https://github.com/zwerch/homebridge-webos2) - the basic idea for the plugin.
