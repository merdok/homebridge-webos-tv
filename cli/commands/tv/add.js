import * as log from '../../log.js';
import chalk from 'chalk';
import WebosTvHelper from '../../../lib/tools/WebosTvHelper.js';

export const command = 'add <name> <ip> <mac>';
export const description = 'Add a new tv';
export const builder = {};

export const handler = async argv => {
  const {
    name,
    ip,
    mac
  } = argv;

  if (!name) {
    log.error(`You need to specify a tv name`);
  }

  if (!ip) {
    log.error(`You need to specify the tv ip`);
  }

  if (!mac) {
    log.error(`You need to specify the tv mac`);
  }

  try {
    log.info(`Trying to set ${chalk.yellow(ip)} TV volume to ${chalk.green(volume)}`);
    let lgTvCtrl = await WebosTvHelper.connect(ip, mac, debug);
    await lgTvCtrl.setVolumeLevel(volume);
    log.success(`TV volume successfully set to ${chalk.green(volume)}`);
  } catch (err) {
    log.error(err.message);
  }

  process.exit(0);
};
