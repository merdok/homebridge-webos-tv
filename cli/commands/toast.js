import * as log from '../log.js';
import chalk from 'chalk';
import WebosTvHelper from '../../lib/tools/WebosTvHelper.js';

export const command = 'toast <ip> <mac> <message>';
export const description = 'Show a toast on the TV';
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
    message,
    timeout,
    debug
  } = argv;

  if (!message) {
    log.error('Please specify a message!');
    process.exit(0);
  }

  try {
    log.info(`Trying to show a toast on the TV (${chalk.yellow(ip)}) with message ${chalk.green.bold(message)}`);
    let lgTvCtrl = await WebosTvHelper.connect(ip, mac, debug, timeout);
    await lgTvCtrl.openToast(message, null, null, null);
    log.success(`Toast shown!`);
  } catch (err) {
    log.error(err.message);
  }

  process.exit(0);
};
