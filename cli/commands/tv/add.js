import * as log from '../../log.js';
import chalk from 'chalk';
import WebosTvHelper from '../../../lib/tools/WebosTvHelper.js';

export const command = 'add <name> <ip> <mac>';
export const description = 'Add a new TV';
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
    name,
    ip,
    mac,
    timeout,
    debug
  } = argv;

  if (!name) {
    log.error(`You need to specify a TV name`);
    process.exit(0);
  }

  if (!ip) {
    log.error(`You need to specify the TV ip`);
    process.exit(0);
  }

  if (!mac) {
    log.error(`You need to specify the TV mac`);
    process.exit(0);
  }

  try {
    log.info(`Connecting to TV -> ${chalk.yellow(ip)} (${chalk.yellow(mac)})`);
    log.info(`Please accept the pairing request on the TV if necessary...`);
    let lgTvCtrl = await WebosTvHelper.connect(ip, mac, debug, timeout);
    log.info(`Connected to TV! Storing Tv information...`);
    await WebosTvHelper.addTv(name, ip, mac);
    log.success(`TV successfully stored by name: ${chalk.green(name)}`);
  } catch (err) {
    log.error(err.message);
  }

  process.exit(0);
};
