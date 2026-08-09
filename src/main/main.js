const { app, ipcMain, globalShortcut, dialog, net } = require('electron');
const path = require('path');
const semver = require('semver');

const { aiRegistry, getDefaultSupplier } = require('./suppliers');
const { buildTabPreload } = require('./preloadBuilder');
const TrayManager = require('./window/TrayManager');
const WindowManager = require('./window/WindowManager');
const MenuManager = require('./menu/MenuManager');
const FileService = require('./services/FileService');
const ExportService = require('./services/ExportService');
const TabManager = require('./tab/TabManager');
const ThemeService = require('./services/ThemeService');
const QuickLauncherWindow = require('./window/QuickLauncherWindow');
const SearchWindow = require('./window/SearchWindow');

const { getConfig, saveConfig } = require('./config');
const {
    APP_NAME,
    IS_MAC,
    APP_WEBSITE,
    ICON_PATH
} = require('./constants');

const fileService = new FileService();

const trayManager = new TrayManager({
    iconPath: ICON_PATH,
    getContextMenu: (isTray) => menuManager.createContextMenu(isTray),
    getAddTabItems: () => menuManager.addTabItems,
    onShowApp: () => windowManager.showApp(),
    onShowAppAndAddNewTab: (url, quickLauncher) => showAppAndAddNewTab(url, quickLauncher),
    onUpdateMenus: (t, a) => menuManager.updateMenus(t, a),
    getMainWindow: () => windowManager.mainWindow,
    getSearchWindow: () => searchWindow,
});

const searchWindow = new SearchWindow({
    preloadPath: path.join(__dirname, '..', 'preload', 'preload-ui.js'),
    htmlPath: path.join(__dirname, '..', 'renderer', 'search.html'),
    getMainWindow: () => windowManager.mainWindow,
    getCurrentTheme: () => themeService.currentTheme,
    getZoomFactor: () => windowManager.currentZoomFactor,
    getAppHeaderHeight: () => windowManager.appHeaderHeight,
});
const quickLauncherWindowManager = new QuickLauncherWindow({
    getPreloadPath: (url) => buildTabPreload(url),
    getTrayManager: () => trayManager,
    onOpenNewTab: (url) => tabManager.createNewTabBackend(url),
    onShowApp: () => windowManager.showApp(),
    getZoomFactor: () => windowManager.currentZoomFactor,
    onApplyTheme: (view) => themeService.changeViewTheme(view, getConfig('theme') ?? 'system'),
});

const windowManager = new WindowManager({
    preloadPath: path.join(__dirname, '..', 'preload', 'preload-ui.js'),
    htmlPath: path.join(__dirname, '..', 'renderer', 'index.html'),
    getContextMenu: (isTray) => menuManager.createContextMenu(isTray),
    onQuitApp: () => quitApp(),
    getTrayManager: () => trayManager,
    onShowAppAndAddNewTab: (url, quickLauncher) => showAppAndAddNewTab(url, quickLauncher),
    getActiveTabView: () => tabManager.getActiveTabView(),
    onRestoreTabViewSize: (tabView, bounds) => tabManager.restoreTabViewSize(tabView, bounds),
    getSearchWindow: () => searchWindow,
    getQuickLauncherView: () => quickLauncherWindowManager.getView(),
    onQuickLauncherChanged: () => quickLauncherWindowManager.changed(),
    onUpdateMenus: (t, a) => menuManager.updateMenus(t, a),
    setCurrentTheme: (theme) => { themeService.currentTheme = theme; },
});
const tabManager = new TabManager({
    windowManager,
    searchWindow,
    onInjectLocalStorage: (tabView, keys) => themeService.injectLocalStorage(tabView, keys),
    onToggleApplicationTheme: (theme) => themeService.toggleApplicationTheme(theme),
});

const exportService = new ExportService({
    fileService,
    windowManager,
    getActiveTabView: () => tabManager.getActiveTabView(),
});

const menuManager = new MenuManager({
    windowManager,
    trayManager,
    onShowAppAndAddNewTab: (url, quickLauncher) => showAppAndAddNewTab(url, quickLauncher),
    onTriggerExport: (type) => exportService.triggerExport(type),
    onCreateNewTabBackend: (url) => tabManager.createNewTabBackend(url),
    onToggleApplicationTheme: (theme, fromWeb) => themeService.toggleApplicationTheme(theme, fromWeb),
    onToggleTitleBar: () => toggleTitleBar(),
    onQuitApp: (fromExit) => quitApp(fromExit),
    onCheckForUpdates: () => checkForUpdates(),
    onGetAppWebsiteFullURL: (subPath) => getAppWebsiteFullURL(subPath),
    onIsMainWindowVisible: () => isMainWidowVisible(),
});
const themeService = new ThemeService({
    windowManager,
    searchWindow,
    quickLauncherWindowManager,
    tabManager,
    menuManager,
});



const proxyServer = getProxyFromArgv();

function getCallerName() {
    const obj = {};
    Error.captureStackTrace(obj, getCallerName);

    const stack = obj.stack.split('\n');
    if (stack.length > 2) {
        return stack[2];
    }
    return 'unknown';
}

function isMainWidowVisible() {
    if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed()) return false;
    return windowManager.mainWindow.isVisible();
}

function showAppAndAddNewTab(url, quickLauncher = false) {
    const iconDefaults = getConfig('iconDefaults');
    const landingPage = url ?? getDefaultSupplier().landingPage;

    if ((iconDefaults === 'openNewTab' || !trayManager.isPopUpContextMenu) && !quickLauncher) {
        tabManager.createNewTabBackend(landingPage);
        windowManager.showApp();
    } else if (iconDefaults === 'openQuickLauncher' || quickLauncher) {
        quickLauncherWindowManager.open(landingPage);
    }
}

async function checkForUpdates() {
    const currentVersion = semver.coerce(app.getVersion());

    const tagsUrl = 'https://api.github.com/repos/shalahu/g-ai-desktop/tags';
    const downloadUrl = getAppWebsiteFullURL('releases/latest');

    try {
        const response = await net.fetch(tagsUrl, {
            headers: { 'Accept': 'application/vnd.github+json' }
        });

        if (!response.ok) throw new Error('Server responded with status ' + response.status);

        const tagsData = await response.json();
        let latestVersion = null;

        if (tagsData && tagsData.length > 0) {
            latestVersion = semver.coerce(tagsData[0].name);
        } else {
            latestVersion = currentVersion;
        }

        if (semver.gt(latestVersion, currentVersion)) {
            const updateChoice = await dialog.showMessageBox(windowManager.mainWindow, {
                type: 'info',
                buttons: ['Download Now', 'Later'],
                defaultId: 0,
                cancelId: 1,
                title: 'Update Available',
                message: 'A new version of ' + APP_NAME + ' (V' + latestVersion.version + ') is available.',
                detail: 'New features and bug fixes are available in this version.\n\nWould you like to open the download page now?'
            });

            if (updateChoice.response === 0) {
                tabManager.createNewTabBackend(downloadUrl);
            }
        } else {
            await dialog.showMessageBox(windowManager.mainWindow, {
                type: 'info',
                buttons: ['OK'],
                defaultId: 0,
                cancelId: 0,
                title: 'Check for Updates',
                message: 'You are up to date.',
                detail: APP_NAME + ' V' + currentVersion.version + ' is currently the newest version available.'
            });
        }
    } catch (error) {
        await dialog.showMessageBox(windowManager.mainWindow, {
            type: 'error',
            buttons: ['OK'],
            defaultId: 0,
            cancelId: 0,
            title: 'Update Error',
            message: 'Failed to check for updates.',
            detail: 'Please check your internet connection or proxy settings and try again.' + error
        });
    }
}

function getAppWebsiteFullURL(subPath) {
    return new URL(subPath, APP_WEBSITE).href;
}

async function autoSetTitleBar() {
    await windowManager.titleBarView.webContents.executeJavaScript(`document.querySelector('.window-title-bar').style.display 
        = ${(getConfig('autoHideTitleBar') ?? false) ? '"none"' : '"flex"'};`);
    windowManager.autoHideMenuBar();
    menuManager.updateMenus(true);
}

function toggleTitleBar() {
    saveConfig('autoHideTitleBar', !getConfig('autoHideTitleBar'));
    autoSetTitleBar();
}

async function quitApp(fromExit = false) {
    if (getConfig('minimizeToTrayOnClose') || IS_MAC) {
        if (fromExit && !IS_MAC) {
            exit();
        }

        if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) windowManager.mainWindow.hide();
        searchWindow.hide();

        menuManager.updateMenus(true);
    }
    else if (!getConfig("exitDontAskAgain")) {
        const { response } = await dialog.showMessageBox(windowManager.mainWindow, {
            type: 'question',
            buttons: ['Exit', 'Exit & Don\'t Ask Again', 'Cancel'],
            defaultId: 0,
            cancelId: 2,
            title: 'Confirm Exit',
            message: 'Are you sure you want to exit ' + APP_NAME + '?',
            detail: 'Tip: You can enable "Minimize to Tray on Close" in Settings to keep the app running in the background.'
        });

        if (response !== 2) {
            if (response === 1) {
                saveConfig("exitDontAskAgain", true);
            }

            exit();
        }
    }
    else {
        exit();
    }
};

function exit() {
    globalShortcut.unregisterAll();
    trayManager.destroy();
    windowManager.mainWindow.destroy();
    app.quit();
}

function getProxyFromArgv() {
    const args = process.argv;

    const proxyArg = args.find(arg => arg.startsWith('--proxy='));
    if (proxyArg) {
        return proxyArg.split('=')[1];
    }

    const proxyIndex = args.indexOf('--proxy');
    if (proxyIndex !== -1 && proxyIndex + 1 < args.length) {
        if (!args[proxyIndex + 1].startsWith('-')) {
            return args[proxyIndex + 1];
        }
    }

    return null;
}

function isValidURL(str) {
    let stringToTest = str.trim();

    if (!/^https?:\/\//i.test(stringToTest)) {
        stringToTest = 'https://' + stringToTest;
    }

    try {
        const url = new URL(stringToTest);

        return url.hostname.includes('.') || url.hostname === 'localhost';
    } catch (_) {
        return false;
    }
}

ipcMain.handle('quick-launcher-changed', async (event, detail) => {
    await quickLauncherWindowManager.changed(detail);
});

ipcMain.handle('upload-files', (event, acceptString) => fileService.uploadFiles(event, acceptString));

ipcMain.handle('get-file-data', (event, filePath) => fileService.getFileData(filePath));

ipcMain.handle('create-tab', (event, { id, url }) => {
    tabManager.createNewTabInstance(id, url);
});

ipcMain.handle('switch-tab', (event, { id }) => tabManager.switchTab(id));

ipcMain.handle('close-tab', (event, { id }) => tabManager.closeTab(id));

ipcMain.handle('get-current-theme', () => themeService.currentTheme);

ipcMain.handle('toggle-theme-from-ui', (theme) => themeService.toggleApplicationTheme(theme));

ipcMain.handle('get-config', (event, key) => {
    return getConfig(key);
});

ipcMain.handle('is-google-search-ai-mode-real-chat-url', (event, url) => {
    return aiRegistry.get('google_search_ai_node').checkRealChatURL(url, true);
});

ipcMain.handle('get-default-ai-supplier', (event, ignoreStartup) => {
    return getConfig('defaultAISupplier') && (getConfig('openNewTabOnStartup') || ignoreStartup) ? getDefaultSupplier() : {
        id: 'about_blank', landingPage: 'about:blank', label: 'aboutBlank'
    };
});

ipcMain.handle('web-theme-changed', (event, theme) => themeService.toggleApplicationTheme(theme ?? 'system', true));

ipcMain.handle('local-storage-theme-bridge', (event, { key, value }) => {
    return themeService.handleThemeBridge(key, value);
});

ipcMain.handle('mouse-enter-menu', async () => {
    await exportService.blurActiveTabView();
});

ipcMain.handle('mouse-leave-menu', () => {
    exportService.unblurActiveTabView();
});

ipcMain.handle('min-window', async () => {
    windowManager.mainWindow.minimize();
    menuManager.updateMenus();
});

ipcMain.handle('max-window', async () => {
    if (windowManager.mainWindow.isMaximized()) {
        windowManager.mainWindow.unmaximize();

    }
    else {
        windowManager.mainWindow.maximize();
    }

    windowManager.resizeViews();
});

ipcMain.handle('close-window', async () => {
    await quitApp();
});

ipcMain.handle('click-menu-item', (event, itemId) => {
    const targetMenuItem = menuManager.menuItemsRegistry.get(itemId);

    if (!targetMenuItem) return;

    if (targetMenuItem.type === 'checkbox') {
        targetMenuItem.checked = !targetMenuItem.checked;
    }
    else if (targetMenuItem.type === 'radio' && !targetMenuItem.checked) {
        targetMenuItem.checked = true;
    }

    if (targetMenuItem && typeof targetMenuItem.click === 'function') {
        targetMenuItem.click(targetMenuItem, windowManager.mainWindow, { shift: false, alt: false, ctrl: false, meta: false });
    }
});

ipcMain.handle('export-html-content', (event, { htmlContent, type }) => exportService.exportHTMLContent(event.sender, htmlContent, type));

ipcMain.handle('menus-updated', () => {
    windowManager.resizeViews();
    trayManager.stopAnimation();
});

ipcMain.handle('start-search', (event, text) => {
    const view = tabManager.getActiveTabView();
    if (view) view.webContents.findInPage(text, { findNext: false });
});

ipcMain.handle('navigate-search', (event, text, forward) => {
    const view = tabManager.getActiveTabView();
    if (view) view.webContents.findInPage(text, { findNext: true, forward: forward });
});

ipcMain.handle('stop-search', () => {
    for (const [tabId, tabView] of tabManager.tabsMap.entries()) {
        tabView.webContents.stopFindInPage('clearSelection');
    }
});

ipcMain.handle('close-search-window', () => {
    searchWindow.close();
});

ipcMain.handle('zoom-app', (event, factor) => {
    windowManager.zoomApp(factor);
});

ipcMain.handle('net-fetch-html', async (event, { src }) => {
    try {
        const sandboxFrame = tabManager.getActiveTabView()?.webContents.mainFrame.frames.find(f => f.url === src);

        if (sandboxFrame) {
            const renderedHtml = await sandboxFrame.executeJavaScript(`document.documentElement.outerHTML`);
            return renderedHtml;
        }
    } catch (error) { }

    return null;
});

module.exports = {
    proxyServer,
    isValidURL,
    reloadTabView: (webContents) => tabManager.reloadTabView(webContents),
    fileService,
    exportService,
    windowManager,
    trayManager,
    searchWindow,
    quickLauncherWindowManager,
    menuManager,
    tabManager,
    themeService,
};
