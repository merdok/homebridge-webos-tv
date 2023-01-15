import * as log from '../../log.js';
import chalk from 'chalk';
import WebosTvHelper from '../../../lib/tools/WebosTvHelper.js';

export const command = 'show <name>';
export const description = 'Show the stored TV information';
export const builder = {};

export const handler = async argv => {
  const {
    name,
    ip,
    mac
  } = argv;

  if (!name) {
    log.error(`You need to specify a TV name`);
    process.exit(0);
  }

  try {
    log.info(`Retriving data for TV with name ${chalk.yellow(name)}`);
    const storedTv = await WebosTvHelper.getStoredTv(name);
    if (storedTv) {
      log.success(`Stored data for TV found!`);
      log.info(`ip: ${chalk.yellow(storedTv.ip)}`);
      log.info(`mac: ${chalk.yellow(storedTv.mac)}`);
    } else {
      log.info(`No stored TV info found for name ${chalk.yellow(name)}`);
    }
  } catch (err) {
    log.error(err.message);
  }

  process.exit(0);
};
