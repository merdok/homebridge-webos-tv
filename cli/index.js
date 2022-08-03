#!/usr/bin/env node

//import path from 'path';
//import { fileURLToPath } from 'url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

//const __filename = fileURLToPath(import.meta.url);
//const __dirname = path.dirname(__filename);
/*
yargs(hideBin(process.argv)).commandDir(path.join(__dirname, 'commands'))
  .recommendCommands()
  .demandCommand()
  .argv;
*/

import * as pair from './commands/pair.js';
import * as power from './commands/power.js';
import * as volume from './commands/volume.js';
import * as toast from './commands/toast.js';
import * as app from './commands/app.js';
//import * as tv from './commands/tv.js';

yargs(hideBin(process.argv)).command(pair).command(power).command(volume).command(toast).command(app)
  .recommendCommands()
  .demandCommand()
  .argv;
