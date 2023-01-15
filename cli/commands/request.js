import * as log from '../log.js';
import chalk from 'chalk';
import WebosTvHelper from '../../lib/tools/WebosTvHelper.js';

export const command = 'request <ip> <mac> <methodUri> [payload]';
export const description = 'Send a raw request to the TV with the specified payload';
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
    methodUri,
    payload,
    timeout,
    debug
  } = argv;

  const parsedPayload = payload ? JSON.parse(payload) : {};

  try {
    log.info(`Connecting to tv at ${chalk.yellow(ip)}`);
    let lgTvCtrl = await WebosTvHelper.connect(ip, mac, debug, timeout);
    log.info(`Connected! Sending request: ${chalk.blueBright.bold(methodUri)} - ${chalk.cyan.bold(JSON.stringify(parsedPayload))}`);
    const res = await lgTvCtrl.tvRequest(methodUri, parsedPayload);
    log.success(`Response from TV:`);
    log.plain(`${chalk.bold(JSON.stringify(res, null, 2))}`);
  } catch (err) {
    log.error(err.message);
  }

  process.exit(0);
};
