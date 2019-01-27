# homebridge-webos-tv

`homebridge-webos-tv` is a plugin for HomeBridge which allows you to control your webOS TV! It should work with all TVs that support webOS2 and newer.
The idea is that the TV should be controlled completely from the native HomeKit iOS app and Siri, that is why volume appears as a light bulb or external input as a switch.

### Features
* Power status
* Turn on / off
* Mute Status (as light bulb)
* Mute / Unmute (as light bulb)
* Volume control (as light bulb and switches)
* Open apps (switch between apps of your choice and live tv)
* Channel control
* Media control
* Show notifications
* Emulate remote control

Since version 1.5.0 the new HomeKit TV integration is supported introduced in iOS12.2. This is a work in progress and might change. 

## Installation

If you are new to Homebridge, please first read the Homebridge [documentation](https://www.npmjs.com/package/homebridge).
If you are running on a Raspberry, you will find a tutorial in the [homebridge-punt Wiki](https://github.com/cflurin/homebridge-punt/wiki/Running-Homebridge-on-a-Raspberry-Pi).

Install homebridge:
```sh
sudo npm install -g homebridge
```

Install homebridge-webos-tv:
```sh
sudo npm install -g homebridge-webos-tv
```

## Configuration

Add the accessory in `config.json` in your home directory inside `.homebridge`.

Example configuration old service:

```js
{
  "accessories": [
    {
      "accessory": "webostv",
      "name": "My webOS tv",
      "ip": "192.168.0.40",
      "mac": "ab:cd:ef:fe:dc:ba",
      "keyFile": "/home/pi/.homebridge/lgtvKeyFile",
      "pollingInterval": 10,
      "volumeControl": "switch",
      "mediaControl": false,
      "appSwitch":[
         "com.webos.app.photovideo",
         "youtube.leanback.v4",
         "com.webos.app.hdmi2",
         "com.webos.app.externalinput.component"
      ],
      "channelButtons": [3,5,7,8],
      "notificationButtons": [
         "Motion detected - living room",
         "Motion detected - kitchen"
      ],
      "remoteControlButtons": [
         "HOME",
         "LIST",
         "EXIT"
      ]
    }
  ]  
}
```

Example configuration new tv service (HomeKit TV integration, requies iOS 12.2 or newer):

```js
{
  "accessories": [
    {
      "accessory": "webostv",
      "name": "My webOS tv",
      "ip": "192.168.0.40",
      "mac": "ab:cd:ef:fe:dc:ba",
      "keyFile": "/home/pi/.homebridge/lgtvKeyFile",
      "pollingInterval": 10,
      "tvService": true,
      "inputs": [
          {
            "appId": "youtube.leanback.v4",
            "name": "YouTube"
          },
          {
            "appId": "youtube.leanback.v4",
            "name": "Photo Video"
          }
      ],
      "volumeControl": false,
      "channelControl": false,
      "mediaControl": false
    }
  ]  
}
```

You also need to enable **mobile tv on** on your tv for the turn on feature to work correctly.

On newer TVs **LG Connect Apps** under the network settings needs to be enabled.

### Configuration fields
- `accessory` [required]
Should always be "webostv"
- `name` [required]
Name of your accessory
- `ip` [required]
ip address of your tv
- `mac` [required]
Mac address of your tv
- `broadcastAdr` [optional]
If homebridge runs on a host with more than one network interface use this to specify the broadcast address.
- `keyFile` [optional]
To prevent the tv from asking for permission when you reboot homebridge, specify a file path to store the permission token. If the file doesn't exist it'll be created. Don't specify a directory or you'll get an `EISDIR` error. 
- `pollingInterval` [optional]
The TV state background polling interval in seconds. **Default: 5**
- `tvService` [optional]
Wheter to use the new tv service introduced in iOS 12.2. This way you can use the native iOS TV integration to control your TV. This is still in beta.  **Default: false**  
- `inputs` [optional] 
Additional inputs for the new tv service. Replaces the app `appSwitch` service when the new tv service is used. **Default: "" (no additional inputs)**
  - Set an array of app IDs or objects as the value. An object needs to have the *appId* and *name* property
  - Default inputs are: *Live TV*, *HDMI1*, *HDMI2*, *HDMI3*, *Component*, *AV*
  - Inputs can also be switched when the TV is off, in that case an attempt to power on the TV and switch to the chosen input will be made
- `volumeControl` [optional]
Wheter the volume control service is enabled. **Default: true**  
Available values:
  - *true* - slider and switches 
  - *"slider"* - just slider
  - *"switch"* - just switches
- `volumeLimit` [optional]
The max allowed volume which can be set using the volume service. Range 1-100. **Default: 100**
- `channelControl` [optional]
Wheter the channel control service is enabled. **Default: true**
- `mediaControl` [optional]
Wheter the media control service is enabled. Buttons: play, pause, stop, rewind, fast forward. **Default: false**
- `appSwitch` [optional] 
Wheter the app switch service is enabled. This allows to switch live tv with apps of your choice. To get the app ID simply open an app on your TV and check the homebridge console. The app ID of the opened app will be printed. **Default: "" (disabled)**
  - Set an array of app IDs as the value
  - External sources are also apps and can be used as app switches, available sources:
    - *com.webos.app.livetv*
    - *com.webos.app.hdmi1*
    - *com.webos.app.hdmi2*
    - *com.webos.app.hdmi3*
    - *com.webos.app.externalinput.component*
    - *com.webos.app.externalinput.av1*
  - Apps can also be started when the TV is off, in that case an attempt to power on the TV and switch to the chosen app will be made
- `channelButtons` [optional] 
Wheter the channel buttons service is enabled. This allows to create switches for the channels of your choice. This way you can quickly switch between favorite channels. **Default: "" (disabled)**
  - Set an array of channel numbers as the value
  - Channels can also be opened when the TV is off, in that case an attempt to power on the TV and afterwards open the chosen channel will be made.
- `notificationButtons` [optional] 
Wheter the notification buttons service is enabled. This allows to create buttons which when pressed display the specified text on the TV screen. Useful for HomeKit automation or to display text on TV for viewers. **Default: "" (disabled)**
  - Set an array of notification texts as the value
- `remoteControlButtons` [optional] 
Wheter the remote control buttons service is enabled. This allows to emulate remote control buttons. **Default: "" (disabled)**
  - Set an array of commands as the value. Possible values are:
    - *1*, *2*, *3*, *4*, *5*, *6*, *7*, *8*, *9*, *0*, *LIST*, *AD*, *DASH*
    - *MUTE*, *VOLUMEUP*, *VOLUMEDOWN*, *CHANNELUP*, *CHANNELDOWN*, *HOME*, *MENU*
    - *UP*, *DOWN*, *LEFT*, *RIGHT*, *CLICK*, *BACK*, *EXIT*, *PROGRAM*, *ENTER*, *INFO*
    - *RED*, *GREEN*, *YELLOW*, *BLUE*, *LIVE_ZOOM*, *CC*, *PLAY*, *PAUSE*, *REWIND*, *FASTFORWARD*
  - Most probably there are also other values possible which i didn't find yet (like settings or voice command), you can try typing some other values and if you find some that work then please let me know
  
## Troubleshooting
If you have any issues with the plugin or tv services then you can run homebridge in debug mode, which will provide some additional information. This might be useful for debugging issues. 

Homebridge debug mode:
```sh
homebridge -D
```

## Special thanks
[lgtv2](https://github.com/hobbyquaker/lgtv2) - the Node.js remote control module for LG WebOS smart TVs.

[homebridge-lgtv2](https://github.com/alessiodionisi/homebridge-lgtv2) & [homebridge-webos2](https://github.com/zwerch/homebridge-webos2) - the basic idea for the plugin.

[HAP-NodeJS](https://github.com/KhaosT/HAP-NodeJS) & [homebridge](https://github.com/nfarina/homebridge) - for making this possible.
