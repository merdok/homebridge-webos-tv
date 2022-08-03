import * as log from '../../log.js';
import chalk from 'chalk';
import WebosTvHelper from '../../../lib/tools/WebosTvHelper.js';

export const command = 'on <ip> <mac>';
export const description = 'Turn the TV on';
export const builder = {
  broadcastAdr: {
    required: false,
    alias: 'b',
    type: 'string',
    description: 'The network broadcast address. Default: 255.255.255.255'
  },
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
    broadcastAdr,
    timeout,
    debug
  } = argv;

  try {
    log.info(`Trying to turn ${chalk.bold('on')} the TV -> ${chalk.yellow(mac)} (${chalk.yellow(ip)})`);
    if (broadcastAdr) {
      log.info(`Broadcast address -> ${broadcastAdr}`);
    }
    await WebosTvHelper.turnOn(ip, mac, debug, timeout, broadcastAdr);
    log.success(`TV turned on!`);
  } catch (err) {
    log.error(`Could not turn on the TV! Make sure the ip and mac are correct and that the TV is reachable in the network!`);
  }

  process.exit(0);
};
