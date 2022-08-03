import * as getId from './app/get-id.js';
import * as launch from './app/launch.js';

export const command = 'app <action>';
export const description = 'Control or get info about the current running app on the TV';
export const builder = yargs => {
  yargs.command(getId);
  yargs.command(launch);
}
export const handler = () => {};
