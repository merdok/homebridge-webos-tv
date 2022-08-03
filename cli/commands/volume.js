import * as get from './volume/get.js';
import * as set from './volume/set.js';
import * as mute from './volume/mute.js';
import * as unmute from './volume/unmute.js';

export const command = 'volume <action>';
export const description = 'Control the TV volume';
export const builder = yargs => {
  yargs.command(get);
  yargs.command(set);
  yargs.command(mute);
  yargs.command(unmute);
}
export const handler = () => {};
