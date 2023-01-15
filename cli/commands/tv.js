import * as add from './tv/add.js';
import * as show from './tv/show.js';

export const command = 'tv <command>';
export const description = 'Manage your TVs';
export const builder = yargs => {
  yargs.command([add, show]);
}
export const handler = () => {};
