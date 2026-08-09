const { app, Menu, clipboard } = require('electron');
const { IS_LINUX, IS_WINDOWS, APP_ID } = require('./constants');
const { proxyServer, isValidURL, reloadTabView, windowManager } = require('./main');
const { cleanupOldPreloads } = require('./preloadBuilder');

if (IS_LINUX) {
    process.env.ELECTRON_DISABLE_SANDBOX = '1';
    // process.env.ELECTRON_DISABLE_GPU = '1';
}

if (proxyServer) {
    app.commandLine.appendSwitch('proxy-server', proxyServer);

    app.commandLine.appendSwitch('proxy-bypass-list', '<local>;*.localhost;127.0.0.1');
} else { }

if (IS_WINDOWS) {
    app.setAppUserModelId(APP_ID);
}

app.whenReady().then(() => {
    cleanupOldPreloads().catch(() => { }); 
    windowManager.createMainWindow();

    app.on('web-contents-created', (event, webContents) => {
        webContents.on('context-menu', (e, params) => {
            const clipboardText = clipboard.readText().trim();
            let validURL = false;
            let menuLabel = 'Paste and Go';
            const hasSelection = params.selectionText.trim().length > 0;
            const isEditable = params.isEditable;

            if (clipboardText) {
                const truncatedText = clipboardText.length > 30
                    ? clipboardText.substring(0, 30) + '...'
                    : clipboardText;

                if (isValidURL(clipboardText)) {
                    menuLabel = `Paste and Go to ${truncatedText}`;
                    validURL = true;
                } else {
                    menuLabel = `Paste and Go`;
                    validURL = false;
                }
            }

            const defaultMenuTemplate = [
                { label: 'Back', accelerator: 'Alt+Left', visible: webContents.navigationHistory.canGoBack(), click: () => webContents.navigationHistory.goBack() },
                { label: 'Forward', accelerator: 'Alt+Right', visible: webContents.navigationHistory.canGoForward(), click: () => webContents.navigationHistory.goForward() },
                { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => reloadTabView(webContents) },
                { type: 'separator' },
                { label: 'Cut', enabled: hasSelection && isEditable, role: 'cut' },
                { label: 'Copy', enabled: hasSelection, role: 'copy' },
                { label: 'Paste', enabled: isEditable && !!clipboardText, role: 'paste' },
                { type: 'separator' },
                { label: 'Select All', role: 'selectall' },
                { type: 'separator' },
                { label: 'Copy page URL', click: () => clipboard.writeText(webContents.getURL()) },
                { label: menuLabel, visible: validURL, click: () => webContents.loadURL(clipboardText) },
                { type: 'separator' },
                { label: 'Inspect', click: () => webContents.inspectElement(params.x, params.y) }
            ];

            const menu = Menu.buildFromTemplate(defaultMenuTemplate);
            menu.popup();
        });
    });
});
