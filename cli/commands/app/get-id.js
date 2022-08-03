import * as log from '../../log.js';
import chalk from 'chalk';
import WebosTvHelper from '../../../lib/tools/WebosTvHelper.js';

export const command = 'get-id <ip> <mac>';
export const description = 'Get the current app id';
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
    log.info(`Getting current active app id from TV (${chalk.yellow(ip)})`);
    let lgTvCtrl = await WebosTvHelper.connect(ip, mac, debug, timeout);
    let appId = lgTvCtrl.getForegroundAppAppId();
    if (appId) {
      log.success(`Got current active appId: ${chalk.bold(appId)}`);
    } else {
      log.error(`Could not get the current active app id`);
    }
  } catch (err) {
    log.error(err.message);
  }

  process.exit(0);
};
