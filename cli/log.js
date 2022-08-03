import chalk from 'chalk';

export const info = (...args) => {
  console.log(chalk.bgWhite.black(' INFO '), args.join(' '));
};

export const error = (...args) => {
  console.log(chalk.bgRed.black(' ERROR '), args.join(' '));
};

export const warn = (...args) => {
  console.log(chalk.bgYellow.black(' WARNING '), args.join(' '));
};

export const success = (...args) => {
  console.log(chalk.bgGreen.black(' SUCCESS '), args.join(' '));
};

export const plain = (...args) => {
  console.log(args.join(' '));
};

export const table = (...args) => {
  console.table(...args);
}
