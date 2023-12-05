<span align="center">

# homebridge-webos-tv
## HomeKit integration for LG webOS TVs how it's supposed to be

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins#verified-plugins)
[![homebridge-webos-tv](https://badgen.net/npm/v/homebridge-webos-tv?icon=npm)](https://www.npmjs.com/package/homebridge-webos-tv)
[![mit-license](https://badgen.net/npm/license/lodash)](https://github.com/merdok/homebridge-webos-tv/blob/master/LICENSE)
[![follow-me-on-twitter](https://badgen.net/badge/icon/twitter?icon=twitter&label=merdok_dev)](https://twitter.com/merdok_dev)
[![join-discord](https://badgen.net/badge/icon/discord?icon=discord&label=homebridge-webos-tv)](https://discord.gg/F5e2UNT)
<!---[![Discord](https://img.shields.io/discord/725015107985473598.svg?label=&logo=discord&logoColor=ffffff&color=7389D8&labelColor=6A7EC2)](https://discord.gg/5c8njh)--->

</span>

`homebridge-webos-tv` is a plugin for homebridge which allows you to control your LG webOS TV from your Home app! It should work with all TVs that support webOS2 and newer.  
If you are already running a TV with native Homekit integration then you can still benefit from using this plugin with adding even more features and functionality to your TV.

### Features
* HomeKit TV integration
* HomeKit automations
* Turn TV on/off
* Mute/Unmute
* Volume control (as light bulb, buttons or through iOS remote app)
* Change sound output
* Switch inputs
* Open apps
* Channel control
* Media control
* Show notifications
* Emulate remote control
* Run sequences of remote control button presses
* Turn on/off the tv screen
* Reconfigure control center remote
* Switch picture mode
* Adjust picture settings
* Switch sound mode
* Show the service menu or the ezAdjust menu
<!---* Adjust any system settings--->

## Installation

If you are new to homebridge, please first read the homebridge [documentation](https://www.npmjs.com/package/homebridge).
If you are running on a Raspberry, you will find a tutorial in the [homebridge wiki](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Raspbian).

Install homebridge:
```sh
sudo npm install -g homebridge
```

Install homebridge-webos-tv:
```sh
sudo npm install -g homebridge-webos-tv
```

## Configuration

Add the `webostv` platform in `config.json` in your home directory inside `.homebridge`.

Add your TV or multiply TVs in the `devices` or `tvs`  array.

Example configuration:

```js
{
  "platforms": [
    {
      "platform": "webostv",
      "devices": [
        {
          "name": "My webOS tv",
          "ip": "192.168.0.40",
          "mac": "ab:cd:ef:fe:dc:ba",
          "pollingInterval": 10,
          "volumeControl": "buttons",
          "channelControl": false,
          "mediaControl": false,
          "serviceMenuButton": true,
          "appButtons": [
            {
              "appId": "com.webos.app.livetv",
              "name": "Live TV"
            },
            {
              "appId": "com.webos.app.hdmi1",
              "name": "PS4"
            },
            {
              "appId": "youtube.leanback.v4",
              "name": "YouTube",
              "params": {
                "contentTarget": "https://www.youtube.com/tv?v=Bey4XXJAqS8"
              }
            }
          ],
          "channelButtons": [
            3,
            5,
            7
          ],
          "notificationButtons": [
            {
              "message": "Motion detected - living room",
              "name": "Living room motion",
              "appId": "com.webos.app.browser",
              "params": {
                "target": "https://www.google.com/"
              }
            },
            {
              "message": "Motion detected - kitchen",
              "name": "Kitchen motion"
            }
          ],
          "remoteControlButtons": [
            "HOME",
            "EXIT"
          ],
          "soundOutputButtons": [
            "tv_speaker",
            "external_optical",
            "headphone"
          ],
          "remoteSequenceButtons": [
            {
              "sequence": [
                "HOME",
                "RIGHT",
                "RIGHT",
                "RIGHT",
                "ENTER"
              ],
              "name": "screen_share_seq"
            },
            {
              "sequence": [
                "VOLUMEUP",
                "VOLUMEDOWN",
                "MUTE",
                "MUTE"
              ],
              "name": "volume_seq",
              "interval": 1000
            }
          ],
          "ccRemoteRemap": {
            "arrowup": "VOLUMEUP",
            "arrowdown": "VOLUMEDOWN",
            "arrowleft": "CHANNELDOWN",
            "arrowright": "CHANNELUP",
            "select": "PROGRAM",
            "back": "BACK",
            "playpause": "YELLOW",
            "information": "TELETEXT",
            "youtube.leanback.v4":{
              "information": "MUTE",
              "select": "HOME"
            }
          },
          "pictureModeButtons": [
            "eco",
            "game",
            "cinema"
          ],
          "soundModeButtons": [
            "standard",
            "music"
          ],
          "triggers": {
            "volume":{
              "threshold": 50,
              "name": "Volume above 50"
            },
            "backlight":{
              "threshold": 70
            }
          }
        }
      ]
    }
  ]
}
```

You also need to enable **mobile TV on** on your TV for the turn on feature to work correctly.

This is located on your TV under `Settings > General > Mobile TV On`

On newer TVs **LG Connect Apps** under the network settings needs to be enabled.

### Adding the TV to the Home app
Since HomeKit expects only one TV per bridge they will be declared as external accessories and acts as a bridge.  
This means that a TV will not appear in your Home app until you add it!

To add a TV to HomeKit follow this steps:

1. Open the Home <img src="https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png" height="16.42px"> app on your device.
2. Tap the Home tab, then tap <img src="https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png" height="16.42px">.
3. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan*.
4. Select the tv accessory you want to pair.
5. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs, alternatively you can select *Use Camera* and scan the QR code again.

For more info check the homebridge wiki [Connecting Homebridge To HomeKit](https://github.com/homebridge/homebridge/wiki/Connecting-Homebridge-To-HomeKit).

### Inputs
Inputs and apps are automatically fetched from your TV. As default only Live TV and basic external inputs (HDMI1, HDMI2, etc) are enabled in the "inputs spinner". To add more apps to the spinner simply go on the accessory configuration in the Home app and check all the inputs which you would like to have in the spinner.

### Parameters
#### Platform Configuration fields
- `platform` [required]
Should always be **"webostv"**.
- `devices` or `tvs` [required]
A list of your TVs.
#### TV Configuration fields
- `name` [required]
Name of your TV.
- `ip` [required]
ip address of your TV.
- `mac` [required]
Mac address of your TV.
- `broadcastAdr` [optional]
If homebridge runs on a host with more than one network interface use this to specify the broadcast address.
- `keyFile` [optional]
Specify a custom file path to store the permission token for the TV. If the file doesn't exist it'll be created. Don't specify a directory or you'll get an `EISDIR` error. **Default: "~/.homebridge/.webosTv/keyFile_xxx"**
- `prefsDir` [optional]
The directory where TV model info should be saved. **Default: "~/.homebridge/.webosTv"**
- `pollingInterval` [optional]
The TV state background polling interval in seconds. **Default: 5**
- `deepDebugLog` [optional]
Enables additional more detailed debug log. Useful when trying to figure out issues with the plugin. **Default: false**
- `silentLog` [optional]
When enabled all log output will only appear in the debug mode. **Default: false**
- `hideTvService` [optional]
Whether to hide the TV service. This is recommended if your TV supports native HomeKit integration, since the TV accessory already exists.  **Default: false**  
- `volumeLimit` [optional]
The max allowed volume which can be set using the TV. Range 1-100. **Default: 100**
- `volumeControl` [optional]
Whether the volume control service is enabled. **Default: "both"**  
  - Available values:
    - *"both"* or *true* - slider (as lightbulb) and buttons
    - *"none"* or *false* - no volume control
    - *"slider"* - just slider (as lightbulb)
    - *"lightbulb"* - as lightbulb accessory
    - *"fan"* - as fan accessory
    - *"buttons"* - just buttons (Up or Down)
  - The slider (lightbulb and fan) volume control is not supported for ARC sound outputs
- `channelControl` [optional]
Whether the channel control service is enabled. **Default: true**
- `mediaControl` [optional]
Whether the media control service is enabled. Buttons: play, pause, stop, rewind, fast forward. **Default: false**
- `screenControl` [optional]
Whether the screen control service is enabled. Shows a button which allows to turn on/off the TV screen, while the content is still playing. **Default: false**
- `screenSaverControl` [optional]
Whether the screen saver control service is enabled. Shows a button which allows to instantly activate the screen saver on the TV. Can be used only when no content is playing on the TV. **Default: false**
- `serviceMenuButton` [optional]
Shows a buttons which when pressed opens the service menu on the TV. **Default: false**
- `ezAdjustButton` [optional]
Shows a buttons which when pressed opens the ezAdjust menu on the TV. **Default: false**
- `backlightControl` [optional]
Whether the backlight control service is enabled. Allows to control the backlight picture setting of the TV. **Default: false**
- `brightnessControl` [optional]
Whether the brightness control service is enabled. Allows to control the brightness picture setting of the TV. **Default: false**
- `colorControl` [optional]
Whether the color control service is enabled. Allows to control the color picture setting of the TV. **Default: false**
- `contrastControl` [optional]
Whether the contrast control service is enabled. Allows to control the contrast picture setting of the TV. **Default: false**
- `ccRemoteRemap` [optional]
Allows to remap the control center remote buttons. For possible values, see section below. **Default: no remap**
  - Set an object with the following properties: *arrowup*, *arrowdown*, *arrowleft*, *arrowright*, *select*, *back*, *playpause*, *information*
  - For specific apps a dedicated configuration can be created, simply specify a property with the *appId* of the desired app as key and the value as object with the above properties
  - See example above on how the property should look like
- `appButtons` [optional]
Dedicated app buttons which will appear for the TV. Can be used to trigger automations and can be controlled by Siri. **Default: "" (disabled)**
  - Set an array of app IDs or objects as the value. An object needs to have the *appId* and *name* property
  - You can optionally specifiy the *params* property as key/value object to launch the application with the specified parameters
  - To get the app ID simply open an app on your TV and check the homebridge console. The app ID of the opened app will be printed
  - App buttons can also be used when the TV is off, in that case an attempt to power on the TV and open the chosen app will be made
- `channelButtons` [optional]
Whether the channel buttons service is enabled. This allows to create buttons for the channels of your choice. This way you can quickly switch between favorite channels. **Default: "" (disabled)**
  - Set an array of channel numbers as the value
  - You can also set an array of objects as the value. An object can have the following properties:
    - *channelNumber* - [required] the channel number,
    - *channelId* - [optional] the channel id,
    - *name* - [optional] the channel name,
  - Channel buttons can also be used when the TV is off, in that case an attempt to power on the TV and afterwards open the chosen channel will be made.
  - Some webos TVs require the *channelId* in order to be able to switch channels, in that case this property needs to be specified. To get the *channelId* simply change a channel on your TV and check the homebridge console. The *channelId* of the current channel will be printed.
- `notificationButtons` [optional]
Whether the notification buttons service is enabled. This allows to create buttons which when pressed display the specified text on the TV screen in a toast. Useful for HomeKit automations or to display text on TV for viewers. **Default: "" (disabled)**
  - Set an array of notification texts as the value
  - You can also set an array of objects as the value. An object can have the following properties:
    - *message* - [required] the message to display in the notification
    - *name* - [optional] the notification name
    - *appId* - [optional] when specified, clicking on the toast will open the app
    - *params* - [optional] parameters to be used for the app when clicking on the toast
    - *file* - [optional] when specified, the content of the file will be used for the notification message. Specify a file name (will be read from the prefs dir) or full file path
- `remoteControlButtons` [optional]
Whether the remote control buttons service is enabled. This allows to emulate remote control buttons. **Default: "" (disabled)**
  - For possible values, see section below.  
  - Set an array of commands as the value.
  - You can also set an array of objects as the value. An object can have the following properties:
    - *action* - [required] one of the action specified above,
    - *name* - [optional] the remote control button name
- `remoteSequenceButtons` [optional]
Whether the remote sequence buttons service is enabled. This allows to run a sequence of remote control button presses. **Default: "" (disabled)**
  - Set an array of objects as the value. An object can have the following properties:
    - *sequence* - [required] an array of remote control keys. For possible values see `remoteControlButtons` above,
    - *name* - [optional] the sequence name,
    - *interval* - [optional] the interval between sequence actions. Can be a single value or an array of values. Default is 500ms
- `soundOutputButtons` [optional]
Whether the sound output buttons service is enabled. This allows to switch between sound outputs on the TV. **Default: "" (disabled)**
  - Set an array of sound outputs as the value. Example values are:
    - *tv_speaker* - internal tv speaker
    - *external_optical* - optical audio
    - *external_arc* - hdmi arc
    - *lineout* - line out
    - *headphone* - headphones
    - *external_speaker* - audio out (optical/hdmi arc)
    - *tv_external_speaker* - tv speaker and optical
    - *tv_speaker_headphone* - tv speaker and headphones
    - *bt_soundbar* - bluetooth soundbar and bluetooth devices
    - *soundbar* - optical
  - You can also set an array of objects as the value. An object can have the following properties:
    - *soundOutput* - [required] one of the sound outputs specified above,
    - *name* - [optional] the sound output button name
   - Depending on the TV and connected devices to the TV there might also be other values. In that case just switch sound outputs on the TV and check the homebridge log.
- `pictureModeButtons` [optional]
Whether the picture mode buttons service is enabled. This allows to switch between picture modes on the TV. **Default: "" (disabled)**
  - Set an array of picture modes as the value. Available values are below.
  - You can also set an array of objects as the value. An object can have the following properties:
    - *pictureMode* - [required] one of the picture modes specified below,
    - *name* - [optional] the picture mode button name
  - Not all picture modes might be available for all TVs.
- `soundModeButtons` [optional]
Whether the sound mode buttons service is enabled. This allows to switch between sound modes on the TV. **Default: "" (disabled)**
  - Set an array of sound modes as the value. Available values are below.
  - You can also set an array of objects as the value. An object can have the following properties:
    - *soundMode* - [required] one of the sound modes specified below,
    - *name* - [optional] the sound mode button name
  - Not all sound modes might be available for all TVs.
- `triggers` [optional]
Whether the triggers service is enabled. This allows to create occupancy sensors which trigger when the specified threshold is reached. **Default: "" (disabled)**
  - Triggers can be set for the following tv properties: *volume*, *backlight*, *brightness*, *color*, *contrast*
  - Set as an object of trigger properties as key and a trigger object as value. An object can have the following properties:
    - *threshold* - [required] the threshold value which will trigger the occupancy,
    - *name* - [optional] the trigger name
  - See example above on how the property should look like

 <!---
 - `systemSettingsButtons` [optional] [advanced]
 Whether the system settings buttons service is enabled. This allows to change any system settings on the TV. **Default: "" (disabled)**
   - Due to the complexity, not available in the homebridge ui configuration. For possible configuration values see below.
   - Set an array of objects as the value. An object can have the following properties:
     - *category* - [required] category e.g *picture*,
     - *settings* - [required] settings which should be applied,
     - *name* - [optional]  the system settings button name
   - Not all picture modes might be available for all TVs.
   --->

#### Remote control values
- *1*, *2*, *3*, *4*, *5*, *6*, *7*, *8*, *9*, *0*, *LIST*, *AD*, *DASH*,
- *MUTE*, *VOLUMEUP*, *VOLUMEDOWN*, *CHANNELUP*, *CHANNELDOWN*, *HOME*, *MENU*,
- *UP*, *DOWN*, *LEFT*, *RIGHT*, *CLICK*, *BACK*, *EXIT*, *PROGRAM*, *ENTER*, *INFO*,
- *RED*, *GREEN*, *YELLOW*, *BLUE*, *LIVE_ZOOM*, *CC*, *PLAY*, *PAUSE*, *REWIND*, *FASTFORWARD*,
- *POWER*, *FAVORITES*, *RECORD*, *FLASHBACK*, *QMENU*, *GOTOPREV*,
- *GOTONEXT*, *3D_MODE*, *SAP*, *ASPECT_RATIO*, *EJECT*, *MYAPPS*, *RECENT*,
- *BS*, *BS_NUM_1*, *BS_NUM_2*, *BS_NUM_3*, *BS_NUM_4*, *BS_NUM_5*, *BS_NUM_6*, *BS_NUM_7*, *BS_NUM_8*,
- *BS_NUM_9*, *BS_NUM_10*, *BS_NUM_11*, *BS_NUM_12*, *CS1*, *CS1_NUM_1*, *CS1_NUM_2*, *CS1_NUM_3*, *CS1_NUM_4*,
- *CS1_NUM_5*, *CS1_NUM_6*, *CS1_NUM_7*, *CS1_NUM_8*, *CS1_NUM_9*, *CS1_NUM_10*, *CS1_NUM_11*, *CS1_NUM_12*,
- *CS2*, *CS2_NUM_1*, *CS2_NUM_2*, *CS2_NUM_3*, *CS2_NUM_4*, *CS2_NUM_5*, *CS2_NUM_6*, *CS2_NUM_7*, *CS2_NUM_8*,
- *CS2_NUM_9*, *CS2_NUM_10*, *CS2_NUM_11*, *CS2_NUM_12*, *TER*, *TER_NUM_1*, *TER_NUM_2*, *TER_NUM_3*, *TER_NUM_4*,
- *TER_NUM_5*, *TER_NUM_6*, *TER_NUM_7*, *TER_NUM_8*, *TER_NUM_9*, *TER_NUM_10*, *TER_NUM_11*, *TER_NUM_12*,
- *3DIGIT_INPUT*, *BML_DATA*, *JAPAN_DISPLAY*, *TELETEXT*, *TEXTOPTION*, *MAGNIFIER_ZOOM*, *SCREEN_REMOT*

#### Picture modes
- *cinema*, *eco*, *expert1*, *expert2*, *game*, *normal*, *photo*, *sports*, *technicolor*,
- *vivid*, *hdrEffect*,  *hdrCinema*, *hdrCinemaBright*, *hdrExternal*, *hdrGame*,
- *hdrStandard*, *hdrTechnicolor*, *hdrVivid*, *dolbyHdrCinema*,*dolbyHdrCinemaBright*,
- *dolbyHdrDarkAmazon*, *dolbyHdrGame*, *dolbyHdrStandard*, *dolbyHdrVivid*, *dolbyStandard*,
- *filmMaker*

#### Sound modes
- *aiSoundPlus*, *standard*, *movie*, *news*, *sports*, *music*, *game*

<!---
#### System settings
To set system settings you need to specify a category and an object of settings which you would like to set. Known categories with settings:

`picture`

```js
{
  "category": "picture",
  "name": "Set picture settings",
  "settings": {
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
  }
}
```
--->

## CLI
The plugin also offers a command line interface to control your TV directly from the command line.  
Just type `webostv` in the console to get a list of available options.

## Troubleshooting
If you have any issues with the plugin or TV services then you can run homebridge in debug mode, which will provide some additional information. This might be useful for debugging issues.

Homebridge debug mode:
```sh
homebridge -D
```

Deep debug log, add the following to your config.json:
```json
"deepDebugLog": true
```
This will enable additional extra log which might be helpful to debug all kind of issues. Just be aware that this will produce a lot of log information so it is recommended to use a service like https://pastebin.com/ when providing the log for inspection.

## Fixes to known issues

### ‘Connecting to TV’ when adding the TV to HomeKit
Most probably the ports assigned to your tv accessory are not open in your firewall.

To fix that you need to first update the config.json with a fixed range of ports like this:

```
...
  "bridge": {
      "name": "Homebridge",
      "username": "**:**:**:**:**:**",
      "pin": "***-**-***",
      "port": 51283
  },
  "ports": {
      "start": 52100,
      "end": 52150
  },
...
```
After that make sure that the specified range of ports is open in your firewall to allow connections.

### TV not visible when trying to add to HomeKit
When you try to add your TV to the HomeKit app but it is not visbile even when in the homebridge UI it appears, then it most probably is a homebridge cache issue.

###### Homebridge Config UI X
Go to *Homebridge Settings* and click on `Unpair Bridges / Cameras / TVs / External Accessories` and remove the TV from the list. After that try to add your TV to the HomeKit app.

###### HOOBS
Use the `Reset Connection` button and after that try to add your TV to the HomeKit app.

## Special thanks
[lgtv2](https://github.com/hobbyquaker/lgtv2) - the Node.js remote control module for LG WebOS smart TVs.

[HAP-NodeJS](https://github.com/KhaosT/HAP-NodeJS) & [homebridge](https://github.com/nfarina/homebridge) - for making this possible.
