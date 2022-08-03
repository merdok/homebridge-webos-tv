import * as log from '../log.js';
import chalk from 'chalk';
import WebosTvHelper from '../../lib/tools/WebosTvHelper.js';

export const command = 'pair <ip> <mac>';
export const description = 'Pair with the TV';
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

  if (!ip) {
    log.error(`Missing ip! The TV ip address is required!`);
    process.exit(0);
  }

  if (!mac) {
    log.error(`Missing mac! The TV mac address is required!`);
    process.exit(0);
  }

  try {
    log.info(`Trying to pair with the TV -> ${chalk.yellow(ip)} (${chalk.yellow(mac)})`);
    log.info(`Please accept the pairing request on the TV...`);
    let lgTvCtrl = await WebosTvHelper.connect(ip, mac, debug, timeout);
    log.success(`Paired with the TV!`);
  } catch (err) {
    log.error(`Could not pair with the TV! Make sure the ip is correct and that the TV is turned on!`);
  }

  process.exit(0);
};
