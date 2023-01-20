/**
 *      Lgtv2 - Simple Node.js module to remote control LG WebOS smart TVs
 *
 *      MIT (c) Sebastian Raff <hq@ccu.io> (https://github.com/hobbyquaker)
 *      this is a fork of https://github.com/msloth/lgtv.js, heavily modified and rewritten to suite my needs.
 *
 */

// NOTE merdok -> Copy of the above library as it seems not to be maintained anymore...

import * as fs from 'fs';
import { EventEmitter } from 'node:events';
import util from 'util';
import WebSocketClient from 'websocket';
import ppath from 'persist-path';
import mkdirp from 'mkdirp';
import PairingJson from './pairing.js';

var SpecializedSocket = function(ws) {
  this.send = function(type, payload) {
    payload = payload || {};
    // The message should be key:value pairs, one per line,
    // with an extra blank line to terminate.
    var message =
      Object.keys(payload)
      .reduce(function(acc, k) {
        return acc.concat([k + ':' + payload[k]]);
      }, ['type:' + type])
      .join('\n') + '\n\n';

    ws.send(message);
  };

  this.close = function() {
    ws.close();
  };
};

var LGTV = function(config) {
  if (!(this instanceof LGTV)) {
    return new LGTV(config);
  }
  var that = this;

  config = config || {};
  config.url = config.url || 'ws://lgwebostv:3000';
  config.timeout = config.timeout || 15000;
  config.reconnect = typeof config.reconnect === 'undefined' ? 5000 : config.reconnect;
  config.wsconfig = config.wsconfig || {
    keepalive: true,
    keepaliveInterval: 10000,
    dropConnectionOnKeepaliveTimeout: true,
    keepaliveGracePeriod: 5000,
    tlsOptions: {
      rejectUnauthorized: false
    }
  };

  if (typeof config.clientKey === 'undefined') {
    mkdirp(ppath('lgtv2'));
    config.keyFile = (config.keyFile ? config.keyFile : ppath('lgtv2/keyfile-') + config.url.replace(/[a-z]+:\/\/([0-9a-zA-Z-_.]+):\d+/, '$1'));
    try {
      that.clientKey = fs.readFileSync(config.keyFile).toString();
    } catch (err) {}
  } else {
    that.clientKey = config.clientKey;
  }

  that.saveKey = config.saveKey || function(key, cb) {
    that.clientKey = key;
    fs.writeFile(config.keyFile, key, cb);
  };

  var client = new WebSocketClient.client(config.wsconfig);
  var connection = {};
  var isPaired = false;
  var autoReconnect = config.reconnect;

  var specializedSockets = {};

  var callbacks = {};
  var cidCount = 0;
  var cidPrefix = ('0000000' + (Math.floor(Math.random() * 0xFFFFFFFF).toString(16))).slice(-8);

  function getCid() {
    return cidPrefix + ('000' + (cidCount++).toString(16)).slice(-4);
  }

  var pairing = PairingJson;

  var lastError;

  client.on('connectFailed', function(error) {
    if (lastError !== error.toString()) {
      that.emit('error', error);
    }
    lastError = error.toString();

    if (config.reconnect) {
      setTimeout(function() {
        if (autoReconnect) {
          that.connect(config.url);
        }
      }, config.reconnect);
    }
  });

  client.on('connect', function(conn) {
    connection = conn;

    connection.on('error', function(error) {
      that.emit('error', error);
    });

    connection.on('close', function(e) {
      connection = {};
      Object.keys(callbacks).forEach(function(cid) {
        delete callbacks[cid];
      });

      that.emit('close', e);
      that.connection = false;
      if (config.reconnect) {
        setTimeout(function() {
          if (autoReconnect) {
            that.connect(config.url);
          }
        }, config.reconnect);
      }
    });

    connection.on('message', function(message) {
      that.emit('message', message);
      var parsedMessage;
      if (message.type === 'utf8') {
        if (message.utf8Data) {
          try {
            parsedMessage = JSON.parse(message.utf8Data);
          } catch (err) {
            that.emit('error', new Error('JSON parse error ' + message.utf8Data));
          }
        }
        if (parsedMessage && callbacks[parsedMessage.id]) {
          if (parsedMessage.payload && parsedMessage.payload.subscribed) {
            // Set changed array on first response to subscription
            if (typeof parsedMessage.payload.muted !== 'undefined') {
              if (parsedMessage.payload.changed) {
                parsedMessage.payload.changed.push('muted');
              } else {
                parsedMessage.payload.changed = ['muted'];
              }
            }
            if (typeof parsedMessage.payload.volume !== 'undefined') {
              if (parsedMessage.payload.changed) {
                parsedMessage.payload.changed.push('volume');
              } else {
                parsedMessage.payload.changed = ['volume'];
              }
            }
          }
          callbacks[parsedMessage.id](null, parsedMessage.payload);
        }
      } else {
        that.emit('error', new Error('received non utf8 message ' + message.toString()));
      }
    });

    isPaired = false;

    that.connection = false;

    that.register();
  });

  this.register = function() {
    pairing['client-key'] = that.clientKey || undefined;

    that.send('register', undefined, pairing, function(err, res) {
      if (!err && res) {
        if (res['client-key']) {
          that.emit('connect');
          that.connection = true;
          that.saveKey(res['client-key'], function(err) {
            if (err) {
              that.emit('error', err);
            }
          });
          isPaired = true;
        } else {
          that.emit('prompt');
        }
      } else {
        that.emit('error', err);
      }
    });
  };

  this.request = function(uri, payload, cb) {
    this.send('request', uri, payload, cb);
  };

  this.subscribe = function(uri, payload, cb) {
    this.send('subscribe', uri, payload, cb);
  };

  this.send = function(type, uri, /* optional */ payload, /* optional */ cb) {
    if (typeof payload === 'function') {
      cb = payload;
      payload = {};
    }

    if (!connection.connected) {
      if (typeof cb === 'function') {
        cb(new Error('not connected'));
      }
      return;
    }

    var cid = getCid();

    var json = JSON.stringify({
      id: cid,
      type: type,
      uri: uri,
      payload: payload
    });

    if (typeof cb === 'function') {
      switch (type) {
        case 'request':
          callbacks[cid] = function(err, res) {
            // Remove callback reference
            delete callbacks[cid];
            cb(err, res);
          };

          // Set callback timeout
          setTimeout(function() {
            if (callbacks[cid]) {
              cb(new Error('timeout'));
            }
            // Remove callback reference
            delete callbacks[cid];
          }, config.timeout);
          break;

        case 'subscribe':
          callbacks[cid] = cb;
          break;

        case 'register':
          callbacks[cid] = cb;
          break;
        default:
          throw new Error('unknown type');
      }
    }
    connection.send(json);
  };

  this.getSocket = function(url, cb) {
    if (specializedSockets[url]) {
      cb(null, specializedSockets[url]);
      return;
    }

    that.request(url, function(err, data) {
      if (err) {
        cb(err);
        return;
      }

      var special = new WebSocketClient.client({
        tlsOptions: {
          rejectUnauthorized: false
        }
      });
      special
        .on('connect', function(conn) {
          conn
            .on('error', function(error) {
              that.emit('error', error);
            })
            .on('close', function() {
              delete specializedSockets[url];
            });

          specializedSockets[url] = new SpecializedSocket(conn);
          cb(null, specializedSockets[url]);
        })
        .on('connectFailed', function(error) {
          that.emit('error', error);
        });

      special.connect(data.socketPath);
    });
  };

  /**
   *      Connect to TV using a websocket url (eg "ws://192.168.0.100:3000")
   *
   */
  this.connect = function(host) {
    autoReconnect = config.reconnect;

    if (connection.connected && !isPaired) {
      that.register();
    } else if (!connection.connected) {
      that.emit('connecting', host);
      connection = {};
      client.connect(host);
    }
  };

  this.disconnect = function() {
    if (connection && connection.close) {
      connection.close();
    }
    autoReconnect = false;

    Object.keys(specializedSockets).forEach(
      function(k) {
        specializedSockets[k].close();
      }
    );
  };

  setTimeout(function() {
    that.connect(config.url);
  }, 0);
};

util.inherits(LGTV, EventEmitter);


export default LGTV;
