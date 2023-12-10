import * as log from '../../log.js';
import chalk from 'chalk';
import WebosTvHelper from '../../../lib/tools/WebosTvHelper.js';

export const command = 'launch <ip> <mac> <appId> [appParams]';
export const description = 'Launch the app with the specified appId on the TV';
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
  },
  appParams: {
    required: false,
    type: 'string',
    description: 'JSON string of parameters to pass to the app'
  }
};

export const handler = async argv => {
  const {
    ip,
    mac,
    appId,
    timeout,
    debug,
    appParams
  } = argv;

  try {
    log.info(`Trying to launch the app with appId: ${chalk.green.bold(appId)} on the TV (${chalk.yellow(ip)})`);
    let lgTvCtrl = await WebosTvHelper.connect(ip, mac, debug, timeout);
    
    // Parse appParams if provided, otherwise use empty object
    let params = appParams ? JSON.parse(appParams) : {};

    await lgTvCtrl.launchApp(appId, params);
    log.success(`Launched app with appId: ${chalk.green.bold(appId)}`);
  } catch (err) {
    log.error(err.message);
  }

  process.exit(0);
};

