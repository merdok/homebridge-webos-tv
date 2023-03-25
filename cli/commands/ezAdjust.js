import * as log from '../log.js';
import chalk from 'chalk';
import WebosTvHelper from '../../lib/tools/WebosTvHelper.js';

export const command = 'ezAdjust <ip> <mac>';
export const description = 'Open the ezadjust menu on the TV';
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
    log.info(`Trying to open the ezAdjust menu on the TV (${chalk.yellow(ip)})`);
    let lgTvCtrl = await WebosTvHelper.connect(ip, mac, debug, timeout);
    await lgTvCtrl.openEzAdjust();
    log.success(`ezAdjust menu opened!`);
  } catch (err) {
    log.error(err.message);
  }

  process.exit(0);
};
