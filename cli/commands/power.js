import * as on from './power/on.js';
import * as off from './power/off.js';

export const command = 'power <state>';
export const description = 'Turn your TV on or off';
export const builder = yargs => {
  yargs.command(on);
  yargs.command(off);
}
export const handler = () => {};
