# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.4.3] - 2023-12-08
### Added
- Add `filmMaker` picture mode. Thanks @ipichy for the info!

### Fixed
- Fix `silentLog` property not having any effect


## [2.4.2] - 2023-11-26
### Changed
- Added state option for picture mode buttons. Thanks @tcarlson25 for contribution!


## [2.4.1] - 2023-03-29
### Changed
- Increase the live tv subscription delay

### Fixed
- Fix appButtons not working


## [2.4.0] - 2023-03-27
### Added
- New `serviceMenuButton` property which when enabled shows a button that when pressed opens the service menu
- New `ezAdjustButton` property which when enabled shows a button that when pressed opens the ezAdjust menu
- Add `serviceMenu` cli command
- Add `ezAdjust` cli command
- New `soundModeButtons` property which allows to create sound mode buttons to quickly switch between sound modes on the TV
- Add support for sound mode change and `set-sound-mode` cli command. Thanks @pengsrc for contribution!

### Fixed
- Fix channel change service subscription when Live TV is not the starting app
- Fix switch naming


## [2.3.5] - 2023-01-21
### Fixed
- Fixed issues with newer webos firmware versions where SSL is required for a connection


## [2.3.4] - 2023-01-16
### Added
- Add `request` cli command
- Add `luns-send` cli command. Thanks @kopiro for contribution!
- Add `set-picture-mode` cli command. Thanks @Keagel for contribution!


## [2.3.3] - 2022-09-21
### Fixed
- Fix potential crash during input change


## [2.3.2] - 2022-08-31
### Fixed
- Fix fan as volume state


## [2.3.1] - 2022-08-09
### Added
- New `triggers` property which allows to add occupancy sensors which trigger at a certain threshold for specific tv properties
- New `silentLog` property which when enabled allows to disable all log output
- Added a command line interface to control your TV directly from the command line
- Volume control can now be configured as a fan in a addition to the lightbulb
- Allow to configure per app specific control center remote remap

### Changed
- The plugin is now based on pure ESM

### Fixed
- Fix a potential crash during startup


## [2.2.7] - 2022-02-02
### Changed
- As Node.js 12.x will not be supported anymore by homebridge as of April 2022, the minimum required Node.js was bumped to 16.x, please make sure to update: https://github.com/homebridge/homebridge/wiki/How-To-Update-Node.js
- Bump homebridge version dependency

## [2.2.6] - 2021-10-14
### Fixed
- Update dependencies


## [2.2.5] - 2021-10-01
### Fixed
- Fix dependencies


## [2.2.4] - 2021-10-01
### Added
- Lock dependency versions to prevent dependencies breaking the plugin

### Fixed
- Update screen control switch when screen is turned off/on directly on the TV


## [2.2.3] - 2021-09-30
### Fixed
- Improve screen off/on detection


## [2.2.2] - 2021-07-02
### Fixed
- Improve picture mode buttons on TVs with webOS version 3.5 and less


## [2.2.1] - 2021-06-29
### Fixed
- Fix popup which might have appeared when using the picture mode buttons


## [2.2.0] - 2021-05-24
### Added
- New `backlightControl` property which when enabled allows to control the TV backlight setting
- New `brightnessControl` property which when enabled allows to control the TV brightness setting
- New `colorControl` property which when enabled allows to control the TV color setting
- New `contrastControl` property which when enabled allows to control the TV contrast setting
- New `pictureModeButtons` property which allows to create picture mode buttons to quickly switch between picture modes on the TV

### Changed
- Improved the readability of switches by removing the TV name prefix

### Fixed
- Fixed some minor issues


## [2.1.4] - 2021-04-13
### Changed
- Optimize config.schema.json, organize services in sections
- Updated README


## [2.1.3] - 2021-04-02
### Fixed
- Fixed "input limit reached" warning showing up when hide TV service was enabled


## [2.1.2] - 2021-03-22
### Fixed
- Trigger HomeKit automations when pressing Volume Up/Down on the remote control


## [2.1.1] - 2021-02-27
### Fixed
- Fix screen on/off feature on newer LG TVs.


## [2.1.0] - 2021-02-26
### Added
- A file can now be used for notification buttons message. This way dynamic text can be displayed in the notification.  
- New `inputSourcesLimit` property which allows to specify a limit for input sources which will be fetched from the TV. It is not documented in the README as it should only be used in edge cases.

### Changed
- Improved logging
- Updated README

### Fixed
- Fixed a homebridge warning when using external sound devices.


## [2.0.8] - 2020-12-07
### Changed
- Improved tv status reporting
- Improved error logging
- Clarify in config UI that TV must be added explicitly. Thanks @henrik

### Fixed
- Fixed "TV turned on!" appearing in log messages to many times


## [2.0.7] - 2020-10-14
### Fixed
- Fixed an which might have cause to crash the plugin
- Correctly show the error message when a subscription fails
- Fixed illegal value warning


## [2.0.6] - 2020-10-13
### Fixed
- Fixed an issue where the channel buttons service would not update the status in some cases
- Setup on tv connection should not get stuck now in cases where no response comes back from the tv

### Changed
- Some under the hood improvements
- Updated README


## [2.0.5] - 2020-09-28
### Added
- Automatically generate keyFile name for the TV if not specified by the user. Due to this there is no need anymore to specify custom keyFile names when using multiply TVs
- Default keyFile location, if not specified by the user, is now inside the prefsDir

### Changed
- Due to the change in the keyFile location you might be asked by the TV to allow connection to the plugin again
- Bumped dependencies


## [2.0.4] - 2020-09-23
### Fixed
- The tv speaker service is now working properly

### Changed
- Under the hood changes for better readability


## [2.0.3] - 2020-09-20
### Added
- The TV webOS version is now displayed on connection in the console

### Fixed
- TV status should now again work correctly on webOS 2.x TVs
- Home automations with inputs from the "input spinner" should now work properly

### Changed
- Updated README


## [2.0.2] - 2020-09-19
### Added
- new `external_speaker` sound output. Thanks @perana

### Fixed
- Fixed basic inputs missing on TVs with webOS 4.5 and higher (2)


## [2.0.1] - 2020-09-11
### Added
- Notification buttons can now have a `params` property

### Fixed
- Fixed basic inputs missing on TVs with webOS 4.5 and higher
- Fixed a possible crash with the control center remote

### Changed
- Updated README


## [2.0.0] - 2020-09-10
### Added
- Inputs will now automatically be retrieved from the TV. You now only need to enable or disable the desired inputs straight from the Home app
- Notification button service has now an optional `appId` property. When this is set pressing on the notification will take you to the specified app
- Remote control buttons now also accept as an array of objects with `action` and `name` properties as values. This allows you to name your buttons as you desire
- sound output buttons now also accept as an array of objects with `soundOutput` and `name` properties as values. This allows you to name your buttons as you desire
- new `appButtons` property which allows to create dedicated input buttons which can be used for automations or controlled by Siri
- new `screenControl` property which when enabled allows to turn on/off the TV screen
- new `screenSaverControl` property which when enabled allows to instantly activate the screen saver on the tv
- new `ccRemoteRemap` property which allows to completely remap the control center remote buttons
- new `deepDebugLog` property which enabled more detailed debug log

### Changed
- Completely rewrote the plugin!
- Much better status detection and accuracy (I would consider it like native HomeKit at this point)
- Volume limit now also works for any source that changes the volume on the tv, that includes the remote control
- Channel button service now works much more better and more reliable
- Renamed `channelName` property to `name` to be consistent with other properties
- Fixed some typos in the README

### Removed
- Removed `showInputButtons` property as it is no longer needed
- Removed `inputs` property as it is no longer needed and has been replaced by `appButtons` property
- Removed `infoButtonAction` property as it is no longer needed and has been replaced by `ccRemoteRemap` property


## [1.9.3] - 2020-08-02
### Changed
- Fixed a possible crash
- Updated README


## [1.9.2] - 2020-07-23
### Changed
- Fixed config.schema.json volume control
- Fixed some typos


## [1.9.1] - 2020-07-13
### Changed
- Completing the transition to platform. From now one the plugin can only be setup as a platform
- Optimize code

### Removed
- Removed the possibility to setup the plugin as an accessory (breaking change for some users)


## [1.9.0] - 2020-06-22
### Added
- Added new hideTvService configuration property

### Changed
- Fixed some typos

### Removed
- Removed the legacyTvService (breaking change for some users)


## [1.8.9] - 2020-06-14
### Added

### Changed
- Fixed a crash when using the legacyTvService

### Removed


## [1.8.8] - 2020-06-06
### Added

### Changed
- Fixed an issue which might have caused disconnects on some TVs

### Removed


## [1.8.7] - 2020-06-04
### Added

### Changed
- Fixed config.schema.json

### Removed


## [1.8.6] - 2020-05-31
### Added

### Changed
- Updated README
- Small improvements to the volume control service
- More improvements to config.schema.json

### Removed


## [1.8.4] - 2020-05-28
### Added

### Changed
- Updated README
- Improved the config.schema.json

### Removed
- Removed unnecessary logs


## [1.8.3] - 2020-05-27
### Added

### Changed
- Do not shutdown homebridge when mandatory information is missing, instead display an error
- Changed default prefsDir path to "~/.homebridge/.webosTv"

### Removed
- Removed unused dependency


## [1.8.2] - 2020-05-26
### Added
- An optional channelId can now be specified for the channelButtonService

### Changed
- Updated README
- TV information request errors log silently now
- Renamed name to channelName in the channelButtonService

### Removed


## [1.8.1] - 2020-05-25
### Added
- Additional checks when requesting tv information and initializing devices

### Changed
- Updated README

### Removed


## [1.8.0] - 2020-05-24
### Added
- Extended the channelButtonService with an optional name
- Extended the notificationButtonService with an optional name
- Store launch points (apps, inputs)
- Store channel list

### Changed
- Updated README
- Fixed missing AccessoryInformation.Name warning
- Improved logging
- The channelButtonService now also accepts an array of objects as value
- The notificationButtonService now also accepts an array of objects as value
- Wait till all tv information is retrieved
- Platform is now the preferred way to use the plugin, when still using as an accessory a warning will be shown

### Removed
- Input names are no longer beeing saved in a file, renaming should be done in the config.json


## [1.7.1] - 2020-04-23
### Added

### Changed
- Adjusted config.schema.json to be able to handle the new platform
- Fixed a small issue

### Removed


## [1.7.0] - 2020-04-22
### Added
- You can now configure this plugin to run as a platform with multiple TVs
- Small code optimizations
- Additional checks to make sure required properties are set

### Changed

### Removed


## [1.6.5] - 2020-04-05
### Added

### Changed
- Remote button sequence interval can now be an array. This can help to reduce sequence run time since not all actions take the same amount of time

### Removed


## [1.6.4] - 2020-02-13
### Added
- Apps can now be lanuched with parameters. You can specify the launch parameters using the "params" argument per app in the inputs list

### Changed

### Removed


## [1.6.3] - 2019-12-17
### Added
- The plugin can now detect if the Pixel Refresher is running on OLED TVs and display the TV as off at that times
- Power status of the TV can now be debuged
- Fixed a bug with channelButtons
- Optimized code

### Changed

### Removed


## [1.6.2] - 2019-07-09
### Added
- New property `infoButtonAction ` - manually configure the info button on the control center remote
- VolumeUp and VolumeDown buttons now send home automation triggers
- Optimized code

### Changed

### Removed


## [1.6.1] - 2019-05-15
### Added
- New property `remoteSequenceButtons` - run a sequence of remote control button presses
- New property `showInputButtons` - show inpt as buttons for autmation
- New property `legacyTvService` - emulate TV as a switch
- Optimized code

### Changed
- TV service from iOS12.2+ is now the default service

### Removed
- `tvService` property was removed
