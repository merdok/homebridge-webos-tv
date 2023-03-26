import * as log from '../../log.js';
import chalk from 'chalk';
import WebosTvHelper from '../../../lib/tools/WebosTvHelper.js';

export const command = 'set-sound-mode <ip> <mac> <soundMode>';
export const description = 'Set TV sound mode to the specified mode';
export const builder = {
  timeout: {
    required: false,
    alias: 't',
    type: 'number',
    description: 'The call timeout in ms. Default: 5000ms'
  },
  debug: {
    required: false,
    alias: 'd',
    type: 'boolean',
    description: 'Enable debug output'
  }
};

export const handler = async argv => {
  const {
    ip,
    mac,
    soundMode,
    timeout,
    debug
  } = argv;

  try {
    log.info(`Trying to set TV (${chalk.yellow(ip)}) sound mode to ${chalk.green.bold(soundMode)}`);
    let lgTvCtrl = await WebosTvHelper.connect(ip, mac, debug, timeout);
    await lgTvCtrl.setSoundMode(soundMode);
    log.success(`TV sound mode set to ${chalk.green.bold(soundMode)}`);
  } catch (err) {
    log.error(err.message);
  }

  process.exit(0);
};
