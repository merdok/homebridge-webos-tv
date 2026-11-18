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
  config.connectTimeout = config.connectTimeout || 15000;
  config.pairingTimeout = config.pairingTimeout || 120000;
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

  var client = null;
  var connection = {};
  var connecting = false;
  var connectTimer = null;
  var reconnectTimer = null;
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

  function clearConnectTimer() {
    if (connectTimer !== null) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
  }

  function clearReconnectTimer() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect() {
    if (autoReconnect && !connecting && !isPaired && reconnectTimer === null) {
      reconnectTimer = setTimeout(function() {
        reconnectTimer = null;
        if (autoReconnect) {
          that.connect(config.url);
        }
      }, config.reconnect);
    }
  }

  function retireAttempt(dropConnection) {
    var previousClient = client;
    var previousConnection = connection;
    // Retire first: abort/drop may synchronously emit events from this attempt.
    client = null;
    connection = {};
    connecting = false;
    isPaired = false;
    that.connection = false;
    clearConnectTimer();
    Object.keys(callbacks).forEach(function(cid) {
      delete callbacks[cid];
    });
    if (previousClient) {
      previousClient.abort();
    }
    if (previousConnection.connected) {
      if (dropConnection) {
        previousConnection.drop(1006, 'TV connection attempt failed', true);
      } else {
        previousConnection.close();
      }
    }
  }

  function failAttempt(error, failedClient) {
    if (client !== failedClient) {
      return;
    }
    retireAttempt(true);
    var errorText = error.toString();
    if (lastError !== errorText) {
      lastError = errorText;
      that.emit('error', error);
    }
    scheduleReconnect();
  }

  function startConnectTimer(timeout) {
    clearConnectTimer();
    var pendingClient = client;
    connectTimer = setTimeout(function() {
      connectTimer = null;
      if (client === pendingClient && !isPaired) {
        var error = new Error('TV connection or registration timed out');
        error.code = 'ETIMEDOUT';
        failAttempt(error, pendingClient);
      }
    }, timeout);
  }

  function createClient() {
    // websocket mutates its options, so each attempt needs its own copy.
    var attemptClient = new WebSocketClient.client({
      ...config.wsconfig,
      tlsOptions: { ...config.wsconfig.tlsOptions }
    });
    client = attemptClient;

    attemptClient.on('connectFailed', function(error) {
      failAttempt(error, attemptClient);
    });

    attemptClient.on('connect', function(conn) {
      if (client !== attemptClient) {
        conn.drop(1006, 'Connection attempt superseded', true);
        return;
      }
      connection = conn;

      conn.on('error', function(error) {
        if (client === attemptClient) {
          that.emit('error', error);
        }
      });

      conn.on('close', function(e) {
        if (client !== attemptClient) {
          return;
        }
        retireAttempt(false);
        that.emit('close', e);
        scheduleReconnect();
      });

      conn.on('message', function(message) {
        if (client !== attemptClient) {
          return;
        }
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

      that.register();
    });
  }

  this.register = function() {
    pairing['client-key'] = that.clientKey || undefined;

    that.send('register', undefined, pairing, function(err, res) {
      if (!err && res) {
        if (res['client-key']) {
          clearConnectTimer();
          connecting = false;
          isPaired = true;
          that.connection = true;
          lastError = undefined;
          that.emit('connect');
          that.saveKey(res['client-key'], function(err) {
            if (err) {
              that.emit('error', err);
            }
          });
        } else {
          startConnectTimer(config.pairingTimeout);
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
    config.url = host || config.url;
    autoReconnect = config.reconnect;
    if (connecting || (connection.connected && isPaired)) {
      return;
    }
    clearReconnectTimer();
    connecting = true;
    createClient();
    startConnectTimer(config.connectTimeout);
    that.emit('connecting', config.url);
    try {
      client.connect(config.url);
    } catch (error) {
      failAttempt(error, client);
    }
  };

  this.disconnect = function() {
    autoReconnect = false;
    clearReconnectTimer();
    retireAttempt(false);

    Object.keys(specializedSockets).forEach(
      function(k) {
        specializedSockets[k].close();
      }
    );
  };

  reconnectTimer = setTimeout(function() {
    reconnectTimer = null;
    that.connect(config.url);
  }, 0);
};

util.inherits(LGTV, EventEmitter);


export default LGTV;
