import * as pictureMode from './settings/pictureMode.js';

export const command = 'settings <action>';
export const description = 'Control the TV settings';
export const builder = yargs => {
  yargs.command(pictureMode);
}
export const handler = () => {};
