# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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


