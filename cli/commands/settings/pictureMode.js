import * as log from '../../log.js';
import chalk from 'chalk';
import WebosTvHelper from '../../../lib/tools/WebosTvHelper.js';

export const command = 'set-picture-mode <ip> <mac> <pictureMode>';
export const description = 'Set TV picture mode to the specified mode';
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
    pictureMode,
    timeout,
    debug
  } = argv;

  try {
    log.info(`Trying to set TV (${chalk.yellow(ip)}) picture mode to ${chalk.green.bold(pictureMode)}`);
    let lgTvCtrl = await WebosTvHelper.connect(ip, mac, debug, timeout);
    await lgTvCtrl.setPictureMode(pictureMode);
    log.success(`TV picture mode set to ${chalk.green.bold(pictureMode)}`);
  } catch (err) {
    log.error(err.message);
  }

  process.exit(0);
};
