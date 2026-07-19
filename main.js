const { app, BaseWindow, WebContentsView, ipcMain, nativeTheme, Tray, Menu, globalShortcut, nativeImage, BrowserWindow, dialog, net } = require('electron');
const path = require('path');
const fs = require('fs');
const type = require('os');

const constants = require('./constants.js');

const SIDE_PADDING = 0;
const tabsMap = new Map();
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';
const menuItemsRegistry = new Map();
const configPath = path.join(app.getPath('userData'), 'user-config.json');
const DEFAULT_APP_HEADER_HEIGHT = 72;
const DEFAULT_TITLE_BAR_HEIGHT = 32;
const DEFAULT_MAIN_WINDOW_FRAME = getConfig('mainWindowFrame') ?? false;
const DEFAULT_ZOOM_FACTOR = 1;
const MIN_ZOOM_FACTOR = 0.5;
const MAX_ZOOM_FACTOR = 2;
const APP_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) G-AIDesktop/0.10.0 Chrome/150.0.0.0 Electron/31.7.7 Safari/537.36";

let appHeaderHeight = DEFAULT_APP_HEADER_HEIGHT;
let baseAppHeaderHeight = DEFAULT_APP_HEADER_HEIGHT;
let barMenusTemplate = [];
let mainWindow;
let titleBarView;
let tray = null;
let currentTheme = 'dark';
let lastClickTime = 0;
let appTitle = constants.APP_NAME;
let currentZoomFactor = DEFAULT_ZOOM_FACTOR;
let isRealChatURL = false;

function toggleApplicationTheme(theme, fromWeb = false) {
    currentTheme = theme === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : theme;

    let jsCode = null;
    if (currentTheme === 'dark') {
        jsCode = "document.body.classList.replace('light-theme', 'dark-theme');";
    } else {
        jsCode = "document.body.classList.replace('dark-theme', 'light-theme');";
    }

    titleBarView?.webContents.send('theme-changed', currentTheme);
    for (const [id, tabView] of tabsMap.entries()) {
        tabView.webContents.send('theme-changed', currentTheme);

        if (!fromWeb) {
            if (jsCode)
                tabView.webContents.executeJavaScript(jsCode);

            let colorTheme = null;
            if (theme === 'dark') {
                colorTheme = "Bard-Dark-Theme";
            } else if (theme === 'light') {
                colorTheme = "Bard-Light-Theme";
            }

            if (colorTheme)
                setLocalStorage(tabView, 'Bard-Color-Theme', colorTheme);
            else
                removeLocalStorage(tabView, 'Bard-Color-Theme');
        }
    }

    saveConfig('theme', theme);
    updateMenus();
}

function removeLocalStorage(tabView, key) {
    const jsCode = `
        (() => {
            try {
                localStorage.removeItem("${key}");

                const storageEvent = new StorageEvent('storage', {
                    key: "${key}",
                    newValue: null,
                    oldValue: null,
                    url: window.location.href,
                    storageArea: localStorage
                });
                window.dispatchEvent(storageEvent);
            } catch (e) {}
        })();
    `;

    tabView.webContents.executeJavaScript(jsCode);
}

function setLocalStorage(tabView, key, value) {
    const jsInjectCode = `
        (() => {
            try {
                localStorage.setItem("${key}", "${value}");

                const storageEvent = new StorageEvent('storage', {
                    key: "${key}",
                    newValue: "${value}",
                    oldValue: null,
                    url: window.location.href,
                    storageArea: localStorage
                });
                window.dispatchEvent(storageEvent);
            } catch (e) {}
        })();
    `;

    tabView.webContents.executeJavaScript(jsInjectCode);
}

async function getLocalStorage(tabView, key) {
    const jsInjectCode = `
        (() => {
            try {
                return localStorage.getItem("${key}");
            } catch (e) {
                return null;
            }
        })();
    `;

    try {
        const savedValue = await tabView.webContents.executeJavaScript(jsInjectCode);
        return savedValue;
    } catch (error) {
        return null;
    }
}

function injectLocalStorage(tabView, key, setBridge, removeBridge) {
    const injectLocalStorageSpyJS = `
        (() => {
            if (window.__LOCALSTORAGE_SPY_ACTIVE__) return;
            window.__LOCALSTORAGE_SPY_ACTIVE__ = true;

            const originalSet = Storage.prototype.setItem;
            const originalRemove = Storage.prototype.removeItem;

            Storage.prototype.setItem = function (key, value) {
                originalSet.apply(this, arguments);

                if (key === '${key}') {
                    try {
                         window.dispatchEvent(new CustomEvent('${setBridge}', { detail: value }));
                    } catch(e) {}
                }
            };

            Storage.prototype.removeItem = function (key) {
                originalRemove.apply(this, arguments);

                if (key === '${key}') {
                    try {
                        window.dispatchEvent(new CustomEvent('${removeBridge}'));
                    } catch(e) {}
                }
            };
        })();
    `;

    tabView.webContents.executeJavaScript(injectLocalStorageSpyJS).catch((e) => { });
}

function handleTrayClick() {
    const now = Date.now();
    if (now - lastClickTime < 350) return;
    lastClickTime = now;

    if (isMainWidowVisible()) {
        mainWindow.hide();
    } else {
        showApp();
    }

    updateMenus(true);
}

function updateMenus(updateTrayMenus = false) {
    if (updateTrayMenus) {
        tray.setContextMenu(createContextMenu(true));
    }
    Menu.setApplicationMenu(createContextMenu(false));
    updateMenuBar();
}

function isMainWidowVisible() {
    if (!mainWindow) return false;
    return mainWindow.isVisible();
}

function getActiveTabView() {
    return Array.from(tabsMap.values()).find(tab => tab.isVisible);
}

function showApp() {
    mainWindow.show();
    mainWindow.focus();
    getActiveTabView()?.webContents.focus();
}

function showAppAndAddNewTab() {
    createNewTabBackend(constants.LANDING_URL);

    showApp();
}

function createNewTabBackend(url) {
    const tabId = 'tab_' + Date.now();
    createNewTabInstance(tabId, url, true);
}

function resizeViews() {
    if (!mainWindow.isDestroyed() && titleBarView && !titleBarView.webContents.isDestroyed()) {
        const bounds = mainWindow.getContentBounds();

        titleBarView.setBounds({ x: 0, y: 0, width: bounds.width, height: appHeaderHeight });

        restoreTabViewSize(getActiveTabView(), bounds);
    }
}

function createMainWindow() {
    Menu.setApplicationMenu(createContextMenu(false));

    const iconPath = path.join(__dirname, 'icon.png');

    mainWindow = new BaseWindow({
        width: 1200,
        height: 800,
        title: appTitle,
        icon: iconPath,
        frame: DEFAULT_MAIN_WINDOW_FRAME,
        show: true,
        autoHideMenuBar: false
    });

    titleBarView = new WebContentsView({
        webPreferences: {
            preload: path.join(__dirname, 'preload-ui.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.contentView.addChildView(titleBarView);
    titleBarView.webContents.loadFile('index.html');

    currentTheme = getConfig('theme') === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : getConfig('theme');

    mainWindow.on('resize', resizeViews);

    setTimeout(() => {
        resizeViews();
    }, 50);

    mainWindow.on('close', async (e) => {
        e.preventDefault();

        await quitApp();
    });

    mainWindow.on('restore', () => {
        resizeViews();
    });

    globalShortcut.register('CmdOrCtrl+Shift+Space', () => {
        handleTrayClick();
    });

    tray = new Tray(iconPath);

    tray.setToolTip(appTitle);
    tray.setContextMenu(createContextMenu(true));
    tray.on('click',
        () => {
            if (getConfig('iconDefaults') === null || getConfig('iconDefaults') === 'showHideWindow') {
                handleTrayClick();
            }
            else if (getConfig('iconDefaults') === 'openNewTab') {
                showAppAndAddNewTab();
            }
        }
    );

    globalShortcut.register('F11', () => {
        toggleFullscreen();
    });

    globalShortcut.register('CmdOrCtrl+=', () => {
        zoomApp(0.1);
    });

    globalShortcut.register('CmdOrCtrl+-', () => {
        zoomApp(-0.1);
    });

    globalShortcut.register('CmdOrCtrl+0', () => {
        zoomApp(0);
    });

    globalShortcut.register('CmdOrCtrl+Shift+M', () => {
        toggleTitleBar();
    });

    globalShortcut.register('F5', () => {
        getActiveTabView()?.webContents.reload();
    });

    if (!isLinux) {
        mainWindow.on('enter-full-screen', () => {
            autoHideMenuBar();
        });

        mainWindow.on('leave-full-screen', () => {
            autoHideMenuBar();
        });
    }

    setTimeout(() => { toggleApplicationTheme(getConfig('theme') ?? 'system'); }, 250);

    autoHideMenuBar();

    // titleBarView.webContents.openDevTools({ mode: 'detach' });
}

function autoHideMenuBar() {
    const autoHideMenuBar = (getConfig('autoHideTitleBar') ?? false);
    mainWindow.setMenuBarVisibility(!autoHideMenuBar);
    mainWindow.setAutoHideMenuBar(autoHideMenuBar);
}

function toggleFullscreen() {
    const isFull = mainWindow.isFullScreen();

    mainWindow.setFullScreen(!isFull);

    if (isLinux) {
        resizeViews();
    }
}

function zoomApp(factor) {
    currentZoomFactor = titleBarView?.webContents.getZoomFactor();

    if (factor > 0) {
        currentZoomFactor = Math.min(parseFloat((currentZoomFactor + factor).toFixed(1)), MAX_ZOOM_FACTOR);
    }
    else if (factor === 0) {
        currentZoomFactor = DEFAULT_ZOOM_FACTOR;
    }
    else {
        currentZoomFactor = Math.max(parseFloat((currentZoomFactor + factor).toFixed(1)), MIN_ZOOM_FACTOR);
    }

    titleBarView?.webContents.setZoomFactor(currentZoomFactor);
    getActiveTabView()?.webContents.setZoomFactor(currentZoomFactor);

    appHeaderHeight = Math.round(baseAppHeaderHeight * currentZoomFactor);
    updateMenus();
}

async function triggerExport(type) {
    const jsCode = `
        (function() {
            try {
                const iframePrototype = HTMLIFrameElement.prototype;
                const nativeGetter = Object.getOwnPropertyDescriptor(iframePrototype, 'contentWindow').get;

                Object.defineProperty(iframePrototype, 'contentWindow', {
                    get: function() {
                        let win = null;
                        try {
                            win = nativeGetter.call(this);
                        } catch (e1) {
                            try {
                                win = this.contentDocument ? this.contentDocument.defaultView : null;
                            } catch (e2) {
                                const nativeDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'parentNode');
                                if (nativeDesc) {
                                    try {
                                        win = nativeDesc.get.call(this);
                                    } catch (e3) {}
                                }
                            }
                        }

                        if (win) {
                            const iframeElement = this;
                            win.print = function() {
                                try {
                                    let htmlContent = "";
                                    try {
                                        htmlContent = iframeElement.contentDocument.documentElement.innerHTML;
                                    } catch (err) {
                                        try {
                                            htmlContent = win.document.documentElement.innerHTML;
                                        } catch (err2) {
                                            htmlContent = document.body.innerHTML;
                                        }
                                    }

                                    window.dispatchEvent(new CustomEvent('export-html-content', {
                                        detail: {
                                            htmlContent: htmlContent,
                                            type: '${type}'
                                        }
                                    }));
                                } catch (innerError) {}
                            };
                        }

                        return win;
                    },
                    configurable: true,
                    enumerable: true
                });
                const observeMenu = () => {
                        return new Promise((resolve) => {
                            const observer = new MutationObserver((mutations, obs) => {
                            const target = document.querySelector('conversation-actions-icon').querySelector('gem-menu-item[value="download-pdf"]');

                            if (target && target.getBoundingClientRect().width > 0) {
                                obs.disconnect();
                                resolve(target);
                            }
                            });

                            observer.observe(document.body, {
                            childList: true,
                            subtree: true,
                            attributes: true
                            });
                        });
                    };

                (async () => {
                    const menuPromise = observeMenu();

                    setTimeout(() => {window.dispatchEvent(new CustomEvent('mouse-enter-menu'));}, 150);
                    
                    document.querySelector('conversation-actions-icon').querySelector('button').click();

                    const menuItem = await menuPromise;

                    menuItem.click();
                    })();
            } catch (e) {console.log(e);}
        })();
        `;

    const activeTabView = getActiveTabView();
    const isRealChatWindow = await activeTabView.webContents.executeJavaScript(`
                !!(document.querySelector('.conversation-container') && document.querySelector('conversation-actions-icon') && document.querySelector('[trace="ChatContainer"]'))
                `);
    if (isRealChatURL && isRealChatWindow) {
        activeTabView.webContents.executeJavaScript(jsCode);
    }
    else {
        await dialog.showMessageBoxSync(mainWindow, {
            type: 'warning',
            title: 'Export Failed',
            message: 'No conversations found.',
            detail: 'The file cannot be exported because no active chat conversations were detected on this page.',
            buttons: ['OK']
        });
    }
}

function createContextMenu(isTray) {
    const menuTemplate = [];

    const newTabItme = {
        id: 'm-newtab',
        label: 'New Tab',
        click: () => {
            showAppAndAddNewTab();
        }
    };

    const exitItem = {
        id: "m-exit",
        label: 'Exit',
        click: async () => {
            await quitApp(true);
        }
    };

    const separatorItem = { type: 'separator' };

    if (isTray) {
        menuTemplate.push(newTabItme);
        menuTemplate.push(separatorItem);
    }
    else {
        const exportItems = {
            id: "export-menu",
            label: isMac ? 'Export...' : 'Export',
            enabled: isRealChatURL,
            submenu: [
                {
                    id: "m-exprot-html",
                    label: 'Html',
                    enabled: isRealChatURL,
                    click: (menuItem) => {
                        triggerExport('html');
                    }
                },
                {
                    id: "m-exprot-pdf",
                    label: 'PDF',
                    enabled: isRealChatURL,
                    click: (menuItem) => {
                        triggerExport('pdf');
                    }
                },
                {
                    id: "m-exprot-doc",
                    label: 'Doc',
                    enabled: isRealChatURL,
                    click: (menuItem) => {
                        triggerExport('doc');
                    }
                }
            ]
        };

        menuTemplate.push({
            id: "file-menu",
            label: 'File',
            submenu: [newTabItme, separatorItem, exportItems, separatorItem, exitItem]
        });
    }

    const toggleWindowVisibilityItem = {
        id: 'toggle-window-visibility',
        visible: !isLinux,
        accelerator: 'CmdOrCtrl+Shift+Space',
        label: (isMainWidowVisible() ? 'Hide' : 'Show') + ' Window',
        click: () => {
            handleTrayClick();
        }
    };

    if (isTray) {
        menuTemplate.push(toggleWindowVisibilityItem);
        menuTemplate.push(separatorItem);
        menuTemplate.push(exitItem);
    }
    else {
        const zoomFacotrLabel = currentZoomFactor === DEFAULT_ZOOM_FACTOR ? '' : ' (' + Math.round(currentZoomFactor * 100) + '%)'
        const viewItem = {
            id: "view-menu",
            label: "View",
            submenu: [
                {
                    id: "m-zoomin",
                    label: 'Zoom In' + zoomFacotrLabel,
                    enabled: currentZoomFactor != MAX_ZOOM_FACTOR,
                    accelerator: 'CmdOrCtrl+=',
                    click: (menuItem) => {
                        zoomApp(0.1)
                    }
                },
                {
                    id: "m-zoomout",
                    label: 'Zoom Out' + zoomFacotrLabel,
                    enabled: currentZoomFactor != MIN_ZOOM_FACTOR,
                    accelerator: 'CmdOrCtrl+-',
                    click: (menuItem) => {
                        zoomApp(-0.1)
                    }
                },
                {
                    id: "m-zoomactual",
                    label: 'Actual Size',
                    accelerator: 'CmdOrCtrl+0',
                    click: (menuItem) => {
                        zoomApp(0)
                    }
                },
                separatorItem,
                {
                    id: "m-fullscreen",
                    label: 'Toggle Fullscreen',
                    accelerator: 'F11',
                    click: (menuItem) => {
                        toggleFullscreen();
                    }
                },
                separatorItem,
                {
                    id: "m-theme",
                    label: "Theme",
                    submenu: [
                        {
                            id: "m-th-system",
                            label: 'System',
                            type: 'radio',
                            checked: getConfig('theme') === 'system',
                            click: (menuItem) => {
                                toggleApplicationTheme('system');
                            }
                        },
                        {
                            id: "m-th-light",
                            label: 'Light',
                            type: 'radio',
                            checked: getConfig('theme') === 'light',
                            click: (menuItem) => {
                                toggleApplicationTheme('light');
                            }
                        },
                        {
                            id: "m-th-dark",
                            label: 'Dark',
                            type: 'radio',
                            checked: getConfig('theme') === 'dark',
                            click: (menuItem) => {
                                toggleApplicationTheme('dark');
                            }
                        }
                    ]
                },
                {
                    id: "m-menubar",
                    label: (getConfig('autoHideTitleBar') ? 'Show' : 'Hide') + ' Title Bar',
                    visible: !isLinux,
                    accelerator: 'CmdOrCtrl+Shift+M',
                    click: (menuItem) => {
                        toggleTitleBar();
                    }
                }
            ]
        };
        menuTemplate.push(viewItem);

        const settingsItem = {
            id: "setting-menu",
            label: isMac ? 'Settings...' : 'Settings',
            submenu: [
                {
                    id: "m-tray-behavior",
                    label: "Tray Icon Behavior",
                    visible: !isLinux,
                    submenu: [
                        {
                            id: "m-tb-showhide",
                            label: 'Show / Hide Window',
                            type: 'radio',
                            checked: getConfig('iconDefaults') === 'showHideWindow',
                            click: (menuItem) => {
                                saveConfig('iconDefaults', 'showHideWindow');
                                updateMenus();
                            }
                        },
                        {
                            id: "m-tb-newtab",
                            label: 'Open New Tab',
                            type: 'radio',
                            checked: getConfig('iconDefaults') === 'openNewTab',
                            click: (menuItem) => {
                                saveConfig('iconDefaults', 'openNewTab');
                                updateMenus();
                            }
                        }
                    ]
                },
                {
                    id: "m-close-behavior",
                    label: "On Close Behavior",
                    visible: !isMac,
                    submenu: [
                        {
                            id: "m-cb-ask",
                            label: 'Always Ask',
                            type: 'radio',
                            checked: (!getConfig('minimizeToTrayOnClose') || isLinux) && !getConfig('exitDontAskAgain'),
                            click: (menuItem) => {
                                if (!isLinux) {
                                    saveConfig('minimizeToTrayOnClose', !menuItem.checked);
                                }
                                saveConfig('exitDontAskAgain', !menuItem.checked);
                                updateMenus();
                            }
                        },
                        {
                            id: "m-cb-tray",
                            label: 'Minimize to Tray',
                            visible: !isLinux,
                            type: 'radio',
                            checked: getConfig('minimizeToTrayOnClose'),
                            click: (menuItem) => {
                                saveConfig('minimizeToTrayOnClose', menuItem.checked);
                                saveConfig('exitDontAskAgain', !menuItem.checked);
                                updateMenus();
                            }
                        },
                        {
                            id: "m-cb-exit",
                            label: 'Exit Immediately',
                            type: 'radio',
                            checked: getConfig('exitDontAskAgain'),
                            click: (menuItem) => {
                                if (!isLinux) {
                                    saveConfig('minimizeToTrayOnClose', !menuItem.checked);
                                }
                                saveConfig('exitDontAskAgain', menuItem.checked);
                                updateMenus();
                            }
                        }
                    ]
                }
            ]
        };
        menuTemplate.push(settingsItem);

        barMenusTemplate = menuTemplate;
    }

    return Menu.buildFromTemplate(menuTemplate);
}

function updateMenuBar() {
    menuItemsRegistry.clear();
    registerMenuItems(barMenusTemplate);

    const jsonReadyData = prepareTemplateForRenderer(barMenusTemplate);
    const hideTitleBar = getConfig('autoHideTitleBar');
    var tabbarIsHidden = baseAppHeaderHeight === (DEFAULT_APP_HEADER_HEIGHT - DEFAULT_TITLE_BAR_HEIGHT);

    baseAppHeaderHeight = hideTitleBar
        ? (tabbarIsHidden ? baseAppHeaderHeight : baseAppHeaderHeight - DEFAULT_TITLE_BAR_HEIGHT)
        : (tabbarIsHidden ? baseAppHeaderHeight + DEFAULT_TITLE_BAR_HEIGHT : baseAppHeaderHeight);

    appHeaderHeight = Math.round(baseAppHeaderHeight * currentZoomFactor);

    titleBarView.webContents.send('update-menus', { jsonReadyData, hideTitleBar });
}

function registerMenuItems(template) {
    template.map(item => {
        if (item.id) {
            menuItemsRegistry.set(item.id, item);
        }

        if (item.submenu) {
            registerMenuItems(item.submenu);
        }
    });
}

function prepareTemplateForRenderer(template) {
    return template.map(item => {
        const newItem = { ...item };

        if (newItem.accelerator) {
            newItem.accelerator = newItem.accelerator
                .replace(/CmdOrCtrl|CommandOrControl/g, isMac ? '⌘' : 'Ctrl')
                .replace(/Shift/g, isMac ? '⇧' : 'Shift')
                .replace(/Alt/g, isMac ? '⌥' : 'Alt')
                .replace(/Option/g, isMac ? '⌥' : 'Alt');

            if (isMac) {
                newItem.accelerator = newItem.accelerator.replace(/\+/g, '');
            }
        }
        if (newItem.click) {
            newItem.hasClick = true;
        }
        delete newItem.click;

        if (newItem.submenu && Array.isArray(newItem.submenu)) {
            newItem.submenu = prepareTemplateForRenderer(newItem.submenu);
            newItem.RemoveTabIndex = true;
        }
        return newItem;
    });
}

function toggleTitleBar() {
    saveConfig('autoHideTitleBar', !getConfig('autoHideTitleBar'));
    autoSetTitleBar();
}

async function quitApp(fromExit = false) {
    if (getConfig('minimizeToTrayOnClose') || isMac) {
        if (fromExit && !isMac) {
            exit();
        }

        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
        updateMenus();
    }
    else if (!getConfig("exitDontAskAgain")) {
        const choice = await dialog.showMessageBoxSync(mainWindow, {
            type: 'question',
            buttons: ['Exit', 'Exit & Don\'t Ask Again', 'Cancel'],
            defaultId: 0,
            cancelId: 2,
            title: 'Confirm Exit',
            message: 'Are you sure you want to exit ' + appTitle + '?',
            detail: 'Tip: You can enable "Minimize to Tray on Close" in Settings to keep the app running in the background.'
        });

        if (choice !== 2) {
            if (choice == 1) {
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
    if (tray) {
        tray.destroy();
        tray = null;
    };
    mainWindow.destroy();
    app.quit();
}

async function checkIsRealChatURL(tabView) {
    const currentURL = tabView.webContents.getURL();
    const geminiChatRegex = /gemini\.google\.com\/app\/[0-9a-fA-F]{16}/;

    isRealChatURL = geminiChatRegex.test(currentURL);
    updateMenus();
}

function createNewTabInstance(id, url, sendMsg = false) {
    if (!mainWindow) return;

    const tabView = new WebContentsView({
        webPreferences: {
            preload: path.join(__dirname, 'preload-tab.js'),
            contextIsolation: true,
            nodeIntegration: false,
            transparent: true
        }
    });

    tabView.isVisible = false;
    mainWindow.contentView.addChildView(tabView);
    tabsMap.set(id, tabView);

    tabView.webContents.loadURL(url, {
        userAgent: APP_USER_AGENT
    });

    // tabView.webContents.on('did-finish-load', async () => {
    // });

    tabView.webContents.on('did-navigate-in-page', async (event, url) => {
        await checkIsRealChatURL(tabView);
    });

    tabView.webContents.on('page-title-updated', async (e, title) => {
        if (title && title.trim() !== "") {
            titleBarView?.webContents.send('title-changed', { id, title: title.trim() });
        }
    });

    tabView.webContents.setWindowOpenHandler(({ url }) => {
        createNewTabBackend(url);
        return { action: 'deny' };
    });

    tabView.webContents.on('dom-ready', () => {
        injectLocalStorage(tabView, 'Bard-Color-Theme', 'local-storage-set-bridge', 'local-storage-remove-bridge');
    });

    // tabView.webContents.once('did-start-navigation', (event, targetUrl) => {
    //     if (mainWindow.contentView.children.includes(titleBarView)) {
    //         mainWindow.contentView.removeChildView(titleBarView);
    //     }

    //     mainWindow.contentView.addChildView(titleBarView);
    //     titleBarView.webContents.openDevTools({ mode: 'detach' });
    // });

    // tabView.webContents.on('will-navigate', (e, navigateUrl) => {
    //     titleBarView?.webContents.send('url-changed', { id, url: navigateUrl });
    // });

    if (sendMsg) {
        titleBarView?.webContents.send('new-tab-created', { id, url });
    }

    // tabView.webContents.on('did-start-navigation', (event, targetUrl) => {
    //     console.log('did-start-navigation:', targetUrl);
    // });

    // tabView.webContents.on('did-navigate-in-page', (event, targetUrl) => {
    //     console.log('did-navigate-in-page:', targetUrl);
    // });

    // tabView.webContents.session.on('will-download', (event, item, webContents) => {
    //     console.log('will-download');
    // });

    // tabView.webContents.on('will-frame-navigate', (event) => {
    //     const targetUrl = event.url;
    //     console.log('will-frame-navigate', targetUrl);
    // });

    const zoomFactor = titleBarView.webContents.getZoomFactor();
    if (currentZoomFactor !== zoomFactor) {
        currentZoomFactor = zoomFactor;
        updateMenus();
    }
}

app.whenReady().then(createMainWindow);

// app.on('will-quit', () => {
//     console.log('will-quit');
// });

// app.on('window-all-closed', () => {
//     console.log('window-all-closed');
// });

app.on('web-contents-created', (event, webContents) => {
    webContents.on('context-menu', (e, params) => {

        const defaultMenuTemplate = [
            { label: 'Undo', role: 'undo' },
            { label: 'Redo', role: 'redo' },
            { type: 'separator' },
            { label: 'Cut', role: 'cut' },
            { label: 'Copy', role: 'copy' },
            { label: 'Paste', role: 'paste' },
            { type: 'separator' },
            { label: 'Select All', role: 'selectall' },
            { type: 'separator' },
            { label: 'Inspect', click: () => webContents.inspectElement(params.x, params.y) }
        ];

        const menu = Menu.buildFromTemplate(defaultMenuTemplate);
        menu.popup();
    });
});

ipcMain.handle('change-window-bg', (event, { color }) => {
    if (mainWindow) {
        mainWindow.setBackgroundColor(color);
    }
});

function readConfig() {
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (e) { }
    return {};
}

function saveConfig(key, value) {
    try {
        const config = readConfig();
        config[key] = value;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    } catch (e) { }
}

function getConfig(key) {
    const config = readConfig();
    return config[key] !== undefined ? config[key] : null;
}

function createSolidColorImage(hexColor) {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) : 255;

    const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01,
        0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00,
        0x1f, 0x15, 0xc4, 0x89,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54,
        0x78, 0x9c, 0x63,
        0x60, 0x60, 0x60, 0x60, 0x00, 0x00,
        0x00, 0x02, 0x00, 0x01,
        0x32, 0x22, 0xa1, 0x81,
        0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
        0xae, 0x42, 0x60, 0x82
    ]);

    pngBuffer.writeUInt8(r, 41);
    pngBuffer.writeUInt8(g, 42);
    pngBuffer.writeUInt8(b, 43);
    pngBuffer.writeUInt8(a, 44);

    return nativeImage.createFromBuffer(pngBuffer);
}

function restoreTabViewSize(activeTabView, bounds = null) {
    if (!bounds) bounds = mainWindow.getContentBounds();

    if (activeTabView && activeTabView.isVisible) {
        activeTabView.setBounds({
            x: SIDE_PADDING,
            y: appHeaderHeight,
            width: bounds.width - (SIDE_PADDING * 2),
            height: bounds.height - appHeaderHeight - SIDE_PADDING
        });
    }
}

function convertHtmlImagesToBase64(htmlContent, eventSenderWebContents, outerHTML = true) {
    return new Promise((resolve, reject) => {
        let workerWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                offscreen: true,
            }
        });

        workerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

        workerWindow.webContents.on('did-finish-load', async () => {
            try {
                let targetSession = null;
                if (eventSenderWebContents && typeof eventSenderWebContents.isDestroyed === 'function' && !eventSenderWebContents.isDestroyed()) {
                    targetSession = eventSenderWebContents.session;
                } else {
                    targetSession = workerWindow.webContents.session;
                }

                const imgUrls = await workerWindow.webContents.executeJavaScript(`
                    Array.from(document.querySelectorAll('img'))
                        .map(img => img.getAttribute('src'))
                        .filter(src => src && src.startsWith('http') && !src.startsWith('data:'));
                `);

                const rawCookies = await targetSession.cookies.get({});
                const sanitizedCookies = rawCookies
                    .filter(c => c && c.name && c.value)
                    .filter(c => /SID|HSID|SSID|APISID|SAPISID|ACCOUNT|OSID/.test(c.name) || c.domain.includes('google'))
                    .map(c => `${c.name}=${c.value}`);

                const uniqueCookies = [...new Set(sanitizedCookies)];
                const cookieString = uniqueCookies.join('; ');
                const base64Map = {};

                for (let url of imgUrls) {
                    try {
                        const response = await net.fetch(url, {
                            method: 'GET',
                            headers: {
                                'Cookie': cookieString,
                                'User-Agent': APP_USER_AGENT,
                                'Referer': constants.LANDING_URL,
                                'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
                            }
                        });

                        if (response.ok) {
                            const arrayBuffer = await response.arrayBuffer();
                            const base64Str = Buffer.from(arrayBuffer).toString('base64');
                            const contentType = response.headers.get('content-type') || 'image/png';

                            base64Map[url] = `data:${contentType};base64,${base64Str}`;
                        }
                    } catch (netErr) { }
                }

                await workerWindow.webContents.executeJavaScript(`
                    const map = ${JSON.stringify(base64Map)};
                    document.querySelectorAll('img').forEach(img => {
                        if (map[img.src]) { img.src = map[img.src]; }
                    });
                `);

                const cleanedHtmlContent = outerHTML ? await workerWindow.webContents.executeJavaScript(`
                    document.documentElement.outerHTML;
                `) : await workerWindow.webContents.executeJavaScript(`
                    document.documentElement.innerHTML;
                `);

                resolve(cleanedHtmlContent);

            } catch (err) {
                reject(err);
            } finally {
                if (workerWindow) {
                    workerWindow.destroy();
                    workerWindow = null;
                }
            }
        });
    });
}

function generatePdfFromEmbeddedHtml(embeddedHtmlContent) {
    return new Promise((resolve, reject) => {
        let workerWindow = new BrowserWindow({
            show: false
        });

        workerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(embeddedHtmlContent)}`);

        workerWindow.webContents.on('did-finish-load', async () => {
            try {
                const pdfBuffer = await workerWindow.webContents.printToPDF({
                    printBackground: true,
                    pageSize: 'A4',
                    marginsType: 1
                });

                resolve(pdfBuffer);

            } catch (err) {
                reject(err);
            } finally {
                if (workerWindow) {
                    workerWindow.destroy();
                    workerWindow = null;
                }
            }
        });
    });
}

async function blurActiveTabView() {
    const activeTab = getActiveTabView();
    let base64Data = null;
    let image = null;

    if (activeTab) {
        image = await activeTab.webContents.capturePage();
        base64Data = image.toDataURL();

        activeTab.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }

    const bounds = mainWindow.getContentBounds();
    titleBarView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });

    if (!activeTab) {
        image = createSolidColorImage(getConfig('theme') === 'dark' ? '#131314' : '#f0f4f9');
        base64Data = image.toDataURL();
    }

    titleBarView.webContents.send('set-tab-bar-background', base64Data);
}

function unblurActiveTabView() {
    const image = createSolidColorImage(getConfig('theme') === 'dark' ? '#131314' : '#f0f4f9');
    const base64Data = image.toDataURL();

    titleBarView.webContents.send('set-tab-bar-background', base64Data);

    resizeViews();
}

ipcMain.handle('create-tab', (event, { id, url }) => {
    createNewTabInstance(id, url);
});

ipcMain.handle('switch-tab', (event, { id }) => {
    if (!mainWindow) return;
    const bounds = mainWindow.getContentBounds();

    for (const [tabId, tabView] of tabsMap.entries()) {
        if (tabId === id) {
            tabView.isVisible = true;
            restoreTabViewSize(tabView, bounds);
            tabView.webContents.focus();
            checkIsRealChatURL(tabView);
        } else {
            tabView.isVisible = false;
            tabView.setBounds({ x: 10000, y: 10000, width: 1, height: 1 });
        }
    }
});

ipcMain.handle('close-tab', (event, { id }) => {
    if (!mainWindow) return;
    const tabView = tabsMap.get(id);
    if (tabView) {
        mainWindow.contentView.removeChildView(tabView);
        tabView.webContents.destroy();
        tabsMap.delete(id);
    }
});

ipcMain.handle('get-current-theme', () => {
    return currentTheme;
});

ipcMain.handle('toggle-theme-from-ui', (theme) => {
    toggleApplicationTheme(theme);
});

ipcMain.handle('save-config', (event, { key, value }) => {
    saveConfig(key, value);
});

ipcMain.handle('get-config', (event, { key }) => {
    return getConfig(key);
});

ipcMain.handle('get-constants', () => {
    return constants;
});

ipcMain.handle('web-theme-changed', (event, theme) => {
    toggleApplicationTheme(theme ?? 'system', true);
});

ipcMain.handle('mouse-enter-menu', async () => {
    await blurActiveTabView();
});

ipcMain.handle('mouse-leave-menu', () => {
    unblurActiveTabView();
});

ipcMain.handle('min-window', async () => {
    mainWindow.minimize();
    updateMenus();
});

ipcMain.handle('max-window', async () => {
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();

    }
    else {
        mainWindow.maximize();
    }

    if (isLinux) {
        setTimeout(resizeViews, 50);
    }
    else {
        resizeViews();
    }
});

ipcMain.handle('close-window', async () => {
    await quitApp();
});

ipcMain.handle('click-menu-item', (event, itemId) => {
    const targetMenuItem = menuItemsRegistry.get(itemId);

    if (targetMenuItem.type === 'checkbox') {
        targetMenuItem.checked = !targetMenuItem.checked;
    }
    else if (targetMenuItem.type === 'radio' && !targetMenuItem.checked) {
        targetMenuItem.checked = true;
    }

    if (targetMenuItem && typeof targetMenuItem.click === 'function') {
        targetMenuItem.click(targetMenuItem, mainWindow, { shift: false, alt: false, ctrl: false, meta: false });
    }
});

ipcMain.handle('export-html-content', async (event, { htmlContent, type }) => {
    await blurActiveTabView();
    const focusedWindow = BrowserWindow.getFocusedWindow();

    let fileTitle = 'exported_conversation';
    let filters = { name: 'All (*.*)', extensions: [''] };
    let content = '';

    try {
        const match = htmlContent.match(/<h1 class="export-title">([\s\S]*?)<\/h1>/);

        if (match) {
            fileTitle = match[1].trim();
        }

        switch (type) {
            case 'html':
                content = await convertHtmlImagesToBase64(htmlContent, event.sender);
                filters = { name: 'HTML Document (*.' + type + ';*.htm)', extensions: [type, 'htm'] };
                break;
            case 'pdf':
                content = await generatePdfFromEmbeddedHtml(await convertHtmlImagesToBase64(htmlContent, event.sender));
                filters = { name: 'PDF Document (*.' + type + ')', extensions: [type] };
                break;
            case 'doc':
                content = await convertHtmlImagesToBase64(htmlContent, event.sender);
                filters = { name: 'Word 97-2003 Document (*.' + type + ')', extensions: [type] };
                break;
        }

        unblurActiveTabView();

        const { canceled, filePath } = await dialog.showSaveDialog(focusedWindow, {
            title: 'Save As',
            defaultPath: path.join(app.getPath('downloads'), fileTitle + `_${Date.now()}.` + type),
            filters: [
                filters
            ]
        });

        if (!canceled && filePath) {
            fs.writeFileSync(filePath, content, 'utf-8');
        }

    } catch (err) { console.error(err); }
});

ipcMain.handle('menus-updated', () => {
    resizeViews();
});