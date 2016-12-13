'use strict';

const electron = require('electron'),
      fs = require('fs-extra'),
      {app, dialog, ipcMain, Menu, Tray} = electron,
      packageJson = require(__dirname + '/package.json'),

      {dockManager, DockedWindow} = require('./docked-window'),
      ConnectionManager = require('./connection'),
    
      connMan = new ConnectionManager();


const devConfigFile = __dirname + '/config.json';
var devConfig = {};
if (fs.existsSync(devConfigFile)) {
  devConfig = require(devConfigFile);
}


// const isDev = (packageJson.version.indexOf("DEV") !== -1);
const acceleratorKey = "CommandOrControl";


// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the javascript object is GCed.
var mainWindow = null;
var systemTray = null;

// make sure app.getDataPath() exists
// https://github.com/oakmac/cuttle/issues/92
fs.ensureDirSync(app.getPath('userData'));


//------------------------------------------------------------------------------
// Main
//------------------------------------------------------------------------------

function quit() {
    mainWindow.removeAllListeners('close');
    mainWindow.close();
    app.quit();
}

const versionString =
    `Version   ${packageJson.version}\n` +
    `Date      ${packageJson['build-date']}\n` +
    `Commit    ${packageJson['build-commit']}`;

function showVersion() {
    dialog.showMessageBox({
        type: "info",
        title: "Version",
        buttons: ["OK"],
        message: versionString
    });
}

const fileMenu = {
    label: 'File',
    submenu: [
        {
            label: 'Close Window',
            accelerator: acceleratorKey + '+W',
            click: function() {
                var active = dockManager.findActive();
                if (active) {
                    active.close();
                }
            }
        },
        {
            label: 'Quit',
            accelerator: acceleratorKey + '+Q',
            click: quit
        }
    ]
};

const helpMenu = {
    label: 'Help',
    submenu: [
        {
            label: 'Version',
            click: showVersion
        }
    ]
};

const debugMenu = {
    label: 'Debug',
    submenu: [
        {
            label: 'Toggle DevTools',
            accelerator: acceleratorKey + '+Shift+I',
            click: function() {
                var active = dockManager.findActive();
                if (active) active.toggleDevTools();
                else if (mainWindow) mainWindow.toggleDevTools();
            }
        }
    ]
};

const menuTemplate = [fileMenu, debugMenu, helpMenu];


const trayContextMenu = [
    {
        label: 'Quit',
        click: quit
    }
];

//------------------------------------------------------------------------------
// Util
//------------------------------------------------------------------------------

function urlForConvId(convId) {
    return `/c/${convId}`;
}

function showMainWindow() {
    mainWindow = new DockedWindow();
    mainWindow.on('close', e => {
        console.log('"Closing" main window');
        e.preventDefault();
        mainWindow.hide();
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

//------------------------------------------------------------------------------
// Register IPC Calls from the Renderers
//------------------------------------------------------------------------------

ipcMain.on('get-entities', (e, ids) => {
    connMan.getEntities(ids);
});

ipcMain.on('request-status', (e) => {
    // TODO automate this stuff:
    if (connMan.connected) {
        dockManager.dispatch('connected');
        if (connMan.lastSelfInfo) {
            e.sender.send('self-info', connMan.lastSelfInfo);
        }

        var cachedConvs = connMan.lastConversations;
        if (cachedConvs) {
            // if it's a conversation page, filter down
            //  to the conversation they're interested in.
            //  A bit of a hack, but speeds up conversation
            //  window load time by quite a bit
            var convMatch = e.sender.getURL().match(/#\/c\/(.*)/);
            if (convMatch) {
                var convId = convMatch[1];
                cachedConvs = cachedConvs.filter(conv => {
                    return (conv.conversation_id && conv.conversation_id.id === convId) || 
                        (conv.conversation && 
                            conv.conversation_id && 
                            conv.conversation_id.id === convId);
                });
            }

            e.sender.send('recent-conversations', cachedConvs);
        }
    } else {
        e.sender.send('reconnecting');
    }
});

ipcMain.on('select-conv', (e, convId) => {
    var url = urlForConvId(convId);
    console.log("Request: select", url);
    var existing = dockManager.findWithUrl(url);
    if (existing) {
        existing.show();
        return;
    }

    // TODO Using a constructor as if it were a function
    //  leaves a bad smell...
    new DockedWindow(url);
});

ipcMain.on('send', (e, convId, msg) => {
    console.log(`Request: send(${convId}, ${JSON.stringify(msg)})`);
    // forward to the mainWindow so it can update friends list
    if (mainWindow) mainWindow.send('send', convId, msg);

    // do this last, because it modifies msg
    connMan.send(convId, msg);
});

//------------------------------------------------------------------------------
// Ready
//------------------------------------------------------------------------------

app.on('ready', () => {
    // show the main window
    showMainWindow();

    Menu.setApplicationMenu(
        Menu.buildFromTemplate(menuTemplate));

    if (devConfig.hasOwnProperty('dev-tools') && devConfig['dev-tools'] === true) {
        mainWindow.openDevTools();
    }

    // forward events to the client
    ConnectionManager.GLOBAL_EVENTS.forEach(event => {
        connMan.forwardEvent(event, dockManager.dispatch.bind(dockManager));
    });

    ConnectionManager.CHAT_EVENTS.forEach(event => {
        connMan.forwardEvent(event, function(e, convId, ...args) {
            if (mainWindow) mainWindow.send(event, ...args);
            var convWin = dockManager.findWithUrl(urlForConvId(convId));
            if (convWin) convWin.send(event, ...args);
        });
    });

    // begin connecting immediately
    connMan.open();

    // TODO 'click' doesn't work consistently on linux,
    // so we should set the context menu for that; on OSX,
    // though, we want to be able to just click the system
    // menu icon to open the friends list
    const trayMenu = Menu.buildFromTemplate(trayContextMenu);
    systemTray = new Tray(__dirname + '/img/logo-light.png');
    systemTray.on('click', (e) => {
        if (e.altKey) {
            systemTray.popUpContextMenu(trayMenu);
            return;
        }

        if (mainWindow) {
            mainWindow.show();
        } else {
            showMainWindow();
        }
    });
    systemTray.on('right-click', () => {
        systemTray.popUpContextMenu(trayMenu);
    });

    // hide the dock icon; we have a tray icon!
    app.dock.hide();
});
