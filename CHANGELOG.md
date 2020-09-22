# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- new `appButtons` which allows to create dedicated input buttons which can be used for automations or controlled by Siri
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
