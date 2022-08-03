import * as add from './tv/add.js';

export const command = 'tv <command>';
export const description = 'Manage your TVs';
export const builder = yargs => {
  yargs.command(add);
}
export const handler = () => {};
