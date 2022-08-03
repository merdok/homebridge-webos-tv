import * as log from '../../log.js';
import chalk from 'chalk';
import WebosTvHelper from '../../../lib/tools/WebosTvHelper.js';

export const command = 'set <ip> <mac> <volume>';
export const description = 'Set TV volume to the specified level';
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
    volume,
    timeout,
    debug
  } = argv;

  if (isNaN(volume)) {
    log.error('Volume must be a number');
    process.exit(0);
  }

  if (volume < 0) {
    volume = 0;
  }

  if (volume > 100) {
    volume = 100;
  }

  try {
    log.info(`Trying to set TV (${chalk.yellow(ip)}) volume to ${chalk.green.bold(volume)}`);
    let lgTvCtrl = await WebosTvHelper.connect(ip, mac, debug, timeout);
    await lgTvCtrl.setVolumeLevel(volume);
    log.success(`TV volume set to ${chalk.green.bold(volume)}`);
  } catch (err) {
    log.error(err.message);
  }

  process.exit(0);
};
