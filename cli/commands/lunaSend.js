import * as log from "../log.js";
import chalk from "chalk";
import WebosTvHelper from "../../lib/tools/WebosTvHelper.js";

export const command = "luna-send <ip> <mac> <message> <payloadJson>";
export const description = "Send a message to the Luna bus of the TV";
export const builder = {
  timeout: {
    required: false,
    alias: "t",
    type: "number",
    description: "The call timeout in ms. Default: 5000ms",
  },
  debug: {
    required: false,
    alias: "d",
    type: "boolean",
    description: "Enable debug output",
  },
};

export const handler = async (argv) => {
  const {
    ip,
    mac,
    message,
    payloadJson,
    timeout,
    debug
  } = argv;

  const payloadStruct = payloadJson ? JSON.parse(payloadJson) : {};

  try {
    log.info(`Trying to send the Luna message: ${chalk.green.bold(message)} with payload ${chalk.green.bold(payloadJson)} on the TV (${chalk.yellow(ip)})`);
    let lgTvCtrl = await WebosTvHelper.connect(ip, mac, debug, timeout);
    await lgTvCtrl.lunaSend(message, payloadStruct);
    log.success(`Sent message`);
  } catch (err) {
    log.error(err.message);
  }

  process.exit(0);
};
