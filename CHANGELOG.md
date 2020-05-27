# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]


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


