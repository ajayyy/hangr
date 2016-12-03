/**
 * Connection handling for Hangr; since we have
 *  multiple windows, we have to maintain the
 *  connection in the core process and send
 *  information to the renderers over IPC
 */
'use strict';

const EventEmitter = require('events'),
      {BrowserWindow} = require('electron'),
      Client = require('hangupsjs'),
      Promise = require('promise'),
    
      INITIAL_BACKOFF = 1000;

// Current programmatic login workflow is described here
// https://github.com/tdryer/hangups/issues/260#issuecomment-246578670
const LOGIN_URL = "https://accounts.google.com/o/oauth2/programmatic_auth?hl=en&scope=https%3A%2F%2Fwww.google.com%2Faccounts%2FOAuthLogin+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email&client_id=936475272427.apps.googleusercontent.com&access_type=offline&delegated_client_id=183697946088-m3jnlsqshjhh5lbvg05k46q1k4qqtrgn.apps.googleusercontent.com&top_level_cookie=1";

const CREDS = () => {
    return {
        auth: () => {
            return new AuthFetcher().fetch();
        }
    };
};

class AuthFetcher {
    fetch() {
        return new Promise((fulfill, reject) => {
            var authBrowser = new BrowserWindow({
                width: 800,
                height: 600
            });
            authBrowser.loadURL(LOGIN_URL);
            authBrowser.webContents.on('did-finish-load', () => {
                var url = authBrowser.getURL();
                if (url.indexOf('/o/oauth2/programmatic_auth') < 0) return;

                console.log('login: auth result');
                var session = authBrowser.webContents.session;
                session.cookies.get({}, (err, cookies) => {
                    if (err) return reject(err);

                    var found = cookies.some(cookie => {
                        if (cookie.name === 'oauth_code') {
                            console.log('login: auth success!');
                            fulfill(cookie.value);
                            authBrowser.close();
                            return true;
                        }
                    });

                    if (!found) {
                        console.log('login: no oauth token');
                        reject("No oauth token");
                    }
                });
            });
        });
    }
}

class ConnectionManager extends EventEmitter {
    
    constructor() {
        super();
    }

    /** Be connected */
    open() {
        this._backoff = INITIAL_BACKOFF;

        var client = this.client = new Client();
        client.on('connect_failed', () => {
            setTimeout(this._reconnect.bind(this), this._backoff);
            this.emit('reconnecting in', this._backoff);
            this._backoff *= 2;
        });

        // go!
        this._reconnect();
    }

    _reconnect() {
        this.client.connect(CREDS).done(
            this._connected.bind(this), 
            this._error.bind(this)
        );
    }

    _connected() {
        console.log("conn: Connected!");

        this._backoff = INITIAL_BACKOFF;
        this.emit('connected');
    }

    _error() {
        console.warn("conn: ERROR!", arguments);
    }
}

module.exports = ConnectionManager;
