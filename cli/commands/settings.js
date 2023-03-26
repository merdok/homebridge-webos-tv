import * as pictureMode from './settings/pictureMode.js';
import * as soundMode from './settings/soundMode.js';

export const command = 'settings <action>';
export const description = 'Control the TV settings';
export const builder = yargs => {
  yargs.command([pictureMode]);
  yargs.command([soundMode]);
}
export const handler = () => {};
