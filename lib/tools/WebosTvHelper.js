import path from 'path';
import * as fs from 'fs';
import envPaths from 'env-paths';
import LgTvController from '../LgTvController.js';
import Events from '../Events.js';

const webostvPaths = envPaths('webostv');

const dummyLogger = {
  info: () => {},
  warn: () => {},
  debug: () => {},
  error: () => {}
}

class WebosTvHelper {
  constructor() {
    this.lgTvCtrl = null;

    this.configDir = webostvPaths.config;
    this.devicesFile = path.join(this.configDir, 'devices.json');

    try {
      fs.mkdirSync(this.configDir, {
        recursive: true
      });
    } catch (error) {
      throw new Error(error);
    }

    try {
      this.devices = JSON.parse(fs.readFileSync(this.devicesFile, 'utf8'));
    } catch (error) {
      this.devices = {};
    }

    this.keysDir = webostvPaths.data;

    try {
      fs.mkdirSync(this.keysDir, {
        recursive: true
      });
    } catch (error) {
      throw new Error(error);
    }
  }


  /*----------========== PUBLIC ==========----------*/

  async connect(ip, mac, debug, timeout = 5000) {
    if (!ip) {
      throw new Error(`TV ip must be specified!`);
    }

    if (!mac) {
      throw new Error(`TV mac address must be specified!`);
    }

    let timeoutPromise = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error(`Failed to connect to TV - timed out!`)), Math.max(timeout, 2000)); // minimum 2000ms timeout
    });

    let tvConnectPromise = new Promise((resolve, reject) => {
      this.lgTvCtrl = new LgTvController(ip, mac, ip, this._getKeyFilePath(ip, mac), null, 5000, debug ? console : dummyLogger);
      this.lgTvCtrl.setDeepDebugLogEnabled(debug);
      this.lgTvCtrl.connect();
      this.lgTvCtrl.on(Events.SETUP_FINISHED, async () => {
        resolve(this.lgTvCtrl);
      });
    });

    return Promise.race([
      tvConnectPromise,
      timeoutPromise
    ]);
  }

  async turnOn(ip, mac, debug, timeout = 5000, broadcastAdr = '255.255.255.255') {
    if (!ip) {
      throw new Error(`TV ip must be specified!`);
    }

    if (!mac) {
      throw new Error(`TV mac address must be specified!`);
    }

    let timeoutPromise = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error(`Failed to turn on TV - timed out!`)), Math.max(timeout, 2000)); // minimum 2000ms timeout
    });

    let tvTurnOnPromise = new Promise(async (resolve, reject) => {
      this.lgTvCtrl = new LgTvController(ip, mac, ip, this._getKeyFilePath(ip, mac), broadcastAdr, 5000, debug ? console : dummyLogger);
      this.lgTvCtrl.setDeepDebugLogEnabled(debug);
      this.lgTvCtrl.connect();
      await this.lgTvCtrl.turnOn();
      if (this.lgTvCtrl.isTvOn()) {
        resolve();
      } else {
        reject(new Error(`Could not turn on TV`))
      }
    });

    return Promise.race([
      tvTurnOnPromise,
      timeoutPromise
    ]);
  }


  /*----------========== STORAGE ==========----------*/

  async addTv(name, ip, mac) {
    if (!name) {
      throw new Error(`TV name must be specified!`);
    }

    if (!ip) {
      throw new Error(`TV ip must be specified!`);
    }

    if (!mac) {
      throw new Error(`TV mac must be specified!`);
    }

    this.devices[name] = {};
    this.devices[name].ip = ip;
    this.devices[name].mac = mac;
    fs.writeFileSync(this.devicesFile, JSON.stringify(this.devices), 'utf8')
  }

  async getStoredTv(name) {
    return this.devices[name];
  }


  /*----------========== HELPERS ==========----------*/

  _getKeyFilePath(ip, mac) {
    return path.join(this.keysDir, 'keyFile_' + ip.split('.').join('') + '_' + mac.split(':').join(''));
  }


}

export default new WebosTvHelper();
