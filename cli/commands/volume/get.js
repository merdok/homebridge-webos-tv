import * as log from '../../log.js';
import chalk from 'chalk';
import WebosTvHelper from '../../../lib/tools/WebosTvHelper.js';

export const command = 'get <ip> <mac>';
export const description = 'Get the current TV volume';
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
    timeout,
    debug
  } = argv;

  try {
    log.info(`Getting current TV volume (${chalk.yellow(ip)})`);
    let lgTvCtrl = await WebosTvHelper.connect(ip, mac, debug, timeout);
    let volumeLevel = lgTvCtrl.getVolumeLevel();
    log.success(`Got current TV volume: ${chalk.bold(volumeLevel)}`);
  } catch (err) {
    log.error(err.message);
  }

  process.exit(0);
};
