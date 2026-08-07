const { app, BaseWindow, WebContentsView, ipcMain, nativeTheme, Tray, Menu, globalShortcut, nativeImage, BrowserWindow, dialog, net, Notification, clipboard, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const mammoth = require('mammoth');
const csvtojson = require('csvtojson');
const console = require('console');
const semver = require('semver');

const APP_NAME = "G-AI Desktop";
const SIDE_PADDING = 0;
const IS_MAC = process.platform === 'darwin';
const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';
const DEFAULT_APP_HEADER_HEIGHT = 72;
const DEFAULT_TITLE_BAR_HEIGHT = 32;
const DEFAULT_MAIN_WINDOW_FRAME = getConfig('mainWindowFrame') ?? false;
const DEFAULT_ZOOM_FACTOR = 1;
const MIN_ZOOM_FACTOR = 0.5;
const MAX_ZOOM_FACTOR = 2;
const APP_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) G-AIDesktop/" + app.getVersion() + " Chrome/150.0.0.0 Electron/39.8.10 Safari/537.36";
const WORD_DOC_EXTS = ['doc', 'docx'];
const EXCEL_DATA_SHEET_EXTS = ['csv']
const PLAIN_TEXT_EXTS = ['html', 'htm', 'txt', 'md', 'rtf', 'java', 'py', 'cpp', 'js', 'css', 'cs', 'json', 'ts', 'tsx', 'jsx', 'go', 'rs', 'sh', 'bat', 'yaml', 'yml', 'xml', 'ini', 'toml', 'sql', 'kt', 'swift', 'php', 'tsv', 'log', 'vcf', 'ps1'];
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'heic', 'heif'];
const CONVERTIBLE_TO_PDF_EXTS = [...WORD_DOC_EXTS, ...EXCEL_DATA_SHEET_EXTS, ...PLAIN_TEXT_EXTS, ...IMAGE_EXTS];
const APP_ID = 'com.g-ai.desktop';
const APP_WEBSITE = 'https://github.com/shalahu/g-ai-desktop/';
const ICON_PATH = path.join(__dirname, 'assets/icon.png');

const tabsMap = new Map();
const menuItemsRegistry = new Map();
const configPath = path.join(app.getPath('userData'), 'user-config.json');
const constants = Object.freeze({
    AI_SUPPLIERS: Object.freeze({
        G_GEMINI: { id: 'google_gemini', landingPage: 'https://gemini.google.com/app', label: 'Google Gemini' },
        G_SEACH_AI_MODE: {
            id: 'google_search_ai_node', landingPage: 'https://www.google.com/search?atvm=2&udm=50', label: 'Google Search (AI Mode)'
        },
        DS_CHAT: {
            id: 'deep_seek_chat', landingPage: 'https://chat.deepseek.com/', label: 'DeepSeek'
        },
        KIMI: {
            id: 'kimi', landingPage: 'https://www.kimi.com/', label: 'Kimi'
        },
    }),
});
const proxyServer = getProxyFromArgv();

let appHeaderHeight = DEFAULT_APP_HEADER_HEIGHT;
let baseAppHeaderHeight = DEFAULT_APP_HEADER_HEIGHT;
let barMenusTemplate = [];
let mainWindow = null;
let titleBarView = null;
let tray = null;
let currentTheme = 'dark';
let lastClickTime = 0;
let currentZoomFactor = DEFAULT_ZOOM_FACTOR;
let addTabItems = [];
let searchWin = null;
let quickLauncherWindow = null;
let quickLauncherView = null;
let hasGoogleSeachAIModeDomCheckURL = false;
let ignored1stGoogleSeachAIModeDomCheckURL = false;
let animationTimer = null;
let currentStep = 0;
let baseImage = null;
let cachedFrames = [];
let trayPopUpContextMenu = false;
let currentQuickLauncherProcessingURL = '';

function getDefaultAISupplier() {
    const currentDefaultId = getConfig('defaultAISupplier') ?? constants.AI_SUPPLIERS.G_GEMINI.id;
    const entries = Object.entries(constants.AI_SUPPLIERS);
    const match = entries.find(([key, value]) => value.id === currentDefaultId);

    if (!match) return constants.AI_SUPPLIERS.G_GEMINI;

    const [key, value] = match;
    return { key, ...value };
}

function isDefaltAISupplier(id) {
    const currentDefaultId = getConfig('defaultAISupplier') ?? constants.AI_SUPPLIERS.G_GEMINI.id;
    return id === currentDefaultId;
}

function isDefaultAISupplierSet() {
    return getConfig('defaultAISupplier') !== '';
}

async function toggleApplicationTheme(theme, fromWeb = false) {
    if (getConfig('theme') === theme && fromWeb) {
        return;
    }

    const targetTheme = theme === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : theme;
    currentTheme = targetTheme;

    if (currentTheme === 'dark') {
        changeWindowBg('#131314');
    } else {
        changeWindowBg('#f0f4f9');
    }

    titleBarView?.webContents.send('theme-changed', currentTheme);
    searchWin?.webContents.send('theme-changed', currentTheme);
    await changeViewTheme(quickLauncherView, theme);

    for (const [id, tabView] of tabsMap.entries()) {
        if (!fromWeb || !tabView.isVisible) {
            await changeViewTheme(tabView, theme);
        }
    }

    saveConfig('theme', theme);

    updateMenus();
}

async function changeViewTheme(tabView, theme) {
    if (!tabView) return;

    const bodyClassList = await tabView.webContents.executeJavaScript("Array.from(document.body.classList);");
    const htmlClassList = await tabView.webContents.executeJavaScript("Array.from(document.documentElement.classList);");

    if (bodyClassList.includes('dark-theme') || bodyClassList.includes('light-theme')) {
        tabView.webContents.executeJavaScript(currentTheme === 'dark'
            ? "document.body.classList.replace('light-theme', 'dark-theme');"
            : "document.body.classList.replace('dark-theme', 'light-theme');");

        let colorTheme = null;
        if (theme === 'dark') {
            colorTheme = "Bard-Dark-Theme";
        } else if (theme === 'light') {
            colorTheme = "Bard-Light-Theme";
        }

        if (colorTheme) {
            setLocalStorage(tabView, 'Bard-Color-Theme', colorTheme);
        } else {
            removeLocalStorage(tabView, 'Bard-Color-Theme');
        }
    } else if (bodyClassList.includes('dark') || bodyClassList.includes('light')) {
        const hasElements = await tabView.webContents.executeJavaScript(`!!(document.querySelector('.ds-modal-wrapper')?.querySelectorAll('div.ds-button--outlined[role="button"]'))`);
        if (hasElements) {
            const jsCode = `(() => { 
                        const elements = document.querySelector('.ds-modal-wrapper').querySelectorAll('div.ds-button--outlined[role="button"]');
                        const themes = ['light', 'dark', 'system'];
                        for (let i = 0; i < themes.length; i++) {
                            if (themes[i] === '${theme}') {
                                elements[i].click();
                                break;
                            }
                        }
                    })();`;

            tabView.webContents.executeJavaScript(jsCode);
        } else {
            if (currentTheme === 'dark') {
                tabView.webContents.executeJavaScript("document.body.classList.replace('light', 'dark');");
                tabView.webContents.executeJavaScript("document.body.setAttribute('data-ds-dark-theme', 'dark');");
                tabView.webContents.executeJavaScript(`document.documentElement.setAttribute('data-immersive-translate-page-theme', 'dark');`);
            } else {
                tabView.webContents.executeJavaScript("document.body.classList.replace('dark', 'light');");
                tabView.webContents.executeJavaScript("document.body.removeAttribute('data-ds-dark-theme');");
                tabView.webContents.executeJavaScript(`document.documentElement.setAttribute('data-immersive-translate-page-theme', 'light');`);
            }

            setLocalStorage(tabView, '__appKit_@deepseek/chat_themePreference', `{\\\"value\\\":\\\"${theme}\\\",\\\"__version\\\":\\\"0\\\"}`);
        }
    } else if (htmlClassList.includes('system') || htmlClassList.includes('dark') || htmlClassList.includes('light')) {
        setLocalStorage(tabView, 'CUSTOM_THEME', `\\\"${theme}\\\"`);
    }
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

function injectLocalStorage(tabView, keys) {
    const injectLocalStorageSpyJS = `
        (() => {
            if (window.__LOCALSTORAGE_SPY_ACTIVE__) return;
            window.__LOCALSTORAGE_SPY_ACTIVE__ = true;

            const originalSet = Storage.prototype.setItem;
            const originalRemove = Storage.prototype.removeItem;
            const keys = ${JSON.stringify(keys)};

            Storage.prototype.setItem = function (key, value) {
                originalSet.apply(this, arguments);

                if (keys.includes(key)) {
                    try {
                         window.dispatchEvent(new CustomEvent('local-storage-set-bridge', { detail: {key, value} }));
                    } catch(e) {}
                }
            };

            Storage.prototype.removeItem = function (key) {
                originalRemove.apply(this, arguments);

                if (keys.includes(key)) {
                    try {
                        window.dispatchEvent(new CustomEvent('local-storage-remove-bridge'));
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

    if (isSearchWidowVisible()) {
        searchWin.hide();
    } else {
        searchWin?.show();
    }

    updateMenus(true);
}

function updateMenus(updateTrayMenus = false, updateAppMenus = true) {
    if (updateTrayMenus) {
        tray?.setContextMenu(createContextMenu(true));
    }
    if (updateAppMenus) {
        Menu.setApplicationMenu(createContextMenu(false));
        updateMenuBar();
    }
}

function isSearchWidowVisible() {
    if (!searchWin || searchWin.isDestroyed()) return false;
    return searchWin.isVisible();
}

function isMainWidowVisible() {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
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

function showAppAndAddNewTab(url, quickLauncher = false) {
    const iconDefaults = getConfig('iconDefaults');
    const landingPage = url ?? getDefaultAISupplier().landingPage;

    if ((iconDefaults === 'openNewTab' || !trayPopUpContextMenu) && !quickLauncher) {
        createNewTabBackend(landingPage);
        showApp();
    } else if (iconDefaults === 'openQuickLauncher' || quickLauncher) {
        trayPopUpContextMenu = false;
        startTrayAnimation();

        if (quickLauncherWindow) {
            quickLauncherWindow.hide();
            quickLauncherView.webContents.loadURL(landingPage);
            return;
        };

        quickLauncherWindow = new BrowserWindow({
            width: 0,
            height: 0,
            frame: false,
            resizable: true,
            alwaysOnTop: false,
            show: false
        });

        quickLauncherView = new WebContentsView({
            webPreferences: {
                preload: path.join(__dirname, 'preload-tab.js'),
                contextIsolation: true,
                nodeIntegration: false,
                transparent: true
            }
        });

        quickLauncherWindow.contentView.addChildView(quickLauncherView);
        quickLauncherView.webContents.loadURL(landingPage);

        quickLauncherWindow.on('will-resize', (event, newBounds) => {
            quickLauncherWindow.removeAllListeners('resize');

            quickLauncherWindow.once('resize', async () => {
                const [currentWidth, currentHeight] = quickLauncherWindow.getSize();
                quickLauncherView.setBounds({
                    x: 0,
                    y: 0,
                    width: currentWidth,
                    height: currentHeight
                });

                await quickLauncherView.webContents.executeJavaScript(`
                    document.documentElement.style.overflow = 'auto';
                    document.body.style.overflow = 'auto';

                    window.removeEventListener('mouseup', handleMouseUp);
                    window.removeEventListener('keyup', handleKeyUp);

                    window.addEventListener('keyup', (event) => {
                        if (event.key === 'Escape') {
                            setTimeout(() => {window.dispatchEvent(new CustomEvent('quick-launcher-changed', {
                                detail: event.key 
                        }));}, 150);
                        }
                    });

                    document.documentElement.style['-webkit-app-region'] = 'no-drag';
                `);
            });
        });

        quickLauncherWindow.on('closed', () => {
            quickLauncherWindow = null;
            quickLauncherView = null;
        });

        quickLauncherView.webContents.on('did-finish-load', async () => {
            await quickLauncherView.webContents.executeJavaScript(`
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';

            function handleMouseUp(event) {
                setTimeout(() => {window.dispatchEvent(new CustomEvent('quick-launcher-changed'));}, 150);
            }
            
            window.addEventListener('mouseup', handleMouseUp);

            function handleKeyUp(event) {
                if (event.key === 'Escape') {
                    setTimeout(() => {window.dispatchEvent(new CustomEvent('quick-launcher-changed', {
                        detail: event.key 
                }));}, 150);
                } else {
                    setTimeout(() => {window.dispatchEvent(new CustomEvent('quick-launcher-changed'));}, 150);
                }
            }

            window.addEventListener('keyup', handleKeyUp);
            `);

            setTimeout(async () => {
                await quickLauncherChanged();
                setTimeout(async () => { await quickLauncherChanged(); }, 150);
                stopTrayAnimation();
                showQuickLauncherWindow();
            }, 150 * 2);

            quickLauncherView.webContents.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
                if (checkGeminiRealChatURL(url) || checkGoogleSearchAIModeRealChatURL(url) || checkDeepSeekRealChatURL(url) || checkKimiRealChatURL(url)) {
                    startTrayAnimation();
                    quickLauncherWindow.hide();
                    setTimeout(async () => { await quickLauncherChanged(url); }, 150);
                }
            });
        });
    }
}

function showQuickLauncherWindow() {
    quickLauncherWindow.show();
    quickLauncherWindow.focus();
    quickLauncherView.webContents.focus();
}

async function loadURLWithDomCheck(webContents, url, maxRetries = 6) {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    startTrayAnimation();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (webContents.isDestroyed()) return false;

        webContents.removeAllListeners('did-finish-load');

        const pageLoadPromise = new Promise((resolve) => {
            webContents.once('did-finish-load', () => resolve());
        });

        webContents.loadURL(url);

        await pageLoadPromise;

        await sleep(1000);

        try {
            if (await isGeminiRealChatReady(webContents) || await isGoogleSearchAIModeRealChatReady(webContents) || await isDeepSeekRealChatReady(webContents) || await isKimiRealChatReady(webContents)) {
                stopTrayAnimation();
                return true;
            }
        } catch (err) { }

        if (attempt < maxRetries) {
            await sleep(1000);
        }
    }

    return false;
}

async function quickLauncherChanged(detail) {
    if (!quickLauncherWindow || !quickLauncherView || quickLauncherWindow.isDestroyed()) return;

    if (detail) {
        if (detail === 'Escape') {
            quickLauncherWindow.close();
        } else {
            if (currentQuickLauncherProcessingURL === detail) return;

            currentQuickLauncherProcessingURL = detail;
            if (hasGoogleSeachAIModeDomCheckURL) return;
            hasGoogleSeachAIModeDomCheckURL = checkGoogleSearchAIModeRealChatURL(detail);

            if (hasGoogleSeachAIModeDomCheckURL && !ignored1stGoogleSeachAIModeDomCheckURL) {
                ignored1stGoogleSeachAIModeDomCheckURL = true;
                hasGoogleSeachAIModeDomCheckURL = false;
                return;
            }

            const activeWebContents = createNewTabBackend(detail).webContents;

            if (activeWebContents) {
                const success = await loadURLWithDomCheck(activeWebContents, detail, 6);

                currentQuickLauncherProcessingURL = '';
                hasGoogleSeachAIModeDomCheckURL = false;
                ignored1stGoogleSeachAIModeDomCheckURL = false;

                if (success) {
                    quickLauncherWindow?.close();
                    showApp();
                } else {
                    quickLauncherWindow?.show();
                }
            }
        }

        return;
    }

    let jsCode = '';

    const currentURL = quickLauncherView.webContents.getURL();

    if (currentURL === constants.AI_SUPPLIERS.G_GEMINI.landingPage) {
        jsCode = `
                (function() {
                    const inputEl = document.querySelector('.text-input-field');
                    if (!inputEl) return null;

                    document.documentElement.style['-webkit-app-region'] = 'drag';
                    inputEl.style['-webkit-app-region'] = 'no-drag';
                    const inputDomRect = inputEl.getBoundingClientRect();
                    const overlayEl = document.querySelector('.cdk-overlay-pane');

                    let overlayHeight = 0; 
                    let top = inputDomRect.top;
                    
                    if (overlayEl) {
                        document.documentElement.style['-webkit-app-region'] = 'no-drag';
                        const overlayDomRect = overlayEl.getBoundingClientRect();
                        if (overlayDomRect.y + overlayDomRect.height > inputDomRect.y + inputDomRect.height) {
                            overlayHeight = overlayDomRect.height - (inputDomRect.y + inputDomRect.height - overlayDomRect.y);
                        }

                        if (overlayDomRect.y < inputDomRect.y) {
                            top = overlayDomRect.top;
                            overlayHeight = inputDomRect.y - overlayDomRect.y;
                        }
                    } else {
                        document.documentElement.style['-webkit-app-region'] = 'drag';
                        inputEl.style['-webkit-app-region'] = 'no-drag';
                    }

                    return {
                        width: inputDomRect.width,
                        height: inputDomRect.height + overlayHeight,
                        top: top,
                        left: inputDomRect.left
                    };
                })();
                `;
    } else if (currentURL.includes(constants.AI_SUPPLIERS.G_SEACH_AI_MODE.landingPage)) {
        jsCode = `
                (function() {
                    const inputEl = document.querySelector('div[data-xid="aim-zero-state-input-plate"]');
                    const stateEl = document.querySelector('div[data-xid="aim-zero-state"]').parentElement;
                    if (!inputEl || !stateEl) return null;

                    stateEl.style['-webkit-app-region'] = 'drag';
                    inputEl.style['-webkit-app-region'] = 'no-drag';
                    const inputDomRect = inputEl.getBoundingClientRect();
                    const overlayEl = inputEl.querySelector('div[data-is-aim-input-menu]');

                    let overlayHeight = 0; 
                    let top = inputDomRect.top;
                    
                    if (overlayEl && overlayEl.getBoundingClientRect().height > 0) {
                        stateEl.style['-webkit-app-region'] = 'no-drag';
                        const overlayDomRect = overlayEl.getBoundingClientRect();
                        if (overlayDomRect.y + overlayDomRect.height > inputDomRect.y + inputDomRect.height) {
                            overlayHeight = overlayDomRect.height - (inputDomRect.y + inputDomRect.height - overlayDomRect.y);
                        }

                        if (overlayDomRect.y < inputDomRect.y) {
                            top = overlayDomRect.top;
                            overlayHeight = inputDomRect.y - overlayDomRect.y;
                        }
                    } else {
                        stateEl.style['-webkit-app-region'] = 'drag';
                        inputEl.style['-webkit-app-region'] = 'no-drag';
                    }

                    const container = document.querySelector('[data-xid$="-turns-container"]');

                    if (container) {
                        container.style['-webkit-app-region'] = 'no-drag';
                        const containerDomRect = container.getBoundingClientRect();
                        const containerDomRectHeight = containerDomRect.height + containerDomRect.y - inputDomRect.height - inputDomRect.y;
                        overlayHeight = overlayHeight > containerDomRectHeight ? overlayHeight : containerDomRectHeight;
                    }

                    return {
                        width: inputDomRect.width,
                        height: inputDomRect.height + overlayHeight,
                        top: top,
                        left: inputDomRect.left
                    };
                })();
                `;
    } else if (currentURL === constants.AI_SUPPLIERS.DS_CHAT.landingPage) {
        jsCode = `
                (function() {
                    const modeEl = document.querySelector('div[role="radiogroup"]').parentElement;
                    if (!modeEl) return null;
                    const inputEl = modeEl.nextElementSibling;
                    if (!inputEl) return null;

                    modeEl.parentElement.style['-webkit-app-region'] = 'drag';
                    modeEl.style['-webkit-app-region'] = 'no-drag';
                    inputEl.style['-webkit-app-region'] = 'no-drag';

                    const modeDomRect = modeEl.getBoundingClientRect();
                    const inputDomRect = inputEl.getBoundingClientRect();
                    const inputDomRectHeight = inputDomRect.height + inputDomRect.y - modeDomRect.height - modeDomRect.y; 

                    return {
                        width: inputDomRect.width,
                        height: inputDomRectHeight + modeDomRect.height,
                        top: modeDomRect.top,
                        left: inputDomRect.left
                    };
                })();
                `;
    } else if (currentURL === constants.AI_SUPPLIERS.KIMI.landingPage) {
        jsCode = `
                (function() {
                    const inputEl = document.querySelector('.chat-editor');
                    if (!inputEl) return null;
                    const optionsEl = inputEl.nextElementSibling;
                    if (!optionsEl) return null;
                    const publisherEl = optionsEl.nextElementSibling;
                    if (!publisherEl) return null;

                    inputEl.parentElement.parentElement.parentElement.parentElement.style['-webkit-app-region'] = 'drag';
                    inputEl.style['-webkit-app-region'] = 'no-drag';
                    optionsEl.style['-webkit-app-region'] = 'no-drag';
                    publisherEl.style['-webkit-app-region'] = 'no-drag';

                    const inputDomRect = inputEl.getBoundingClientRect();
                    const optionsDomRect = optionsEl.getBoundingClientRect();
                    const publisherDomRect = publisherEl.getBoundingClientRect();

                    let inputDomRectHeight = inputDomRect.height + optionsDomRect.height + publisherDomRect.height;
                    let inputDomRectTop = inputDomRect.top;

                    function onPrimaryMenuHover() {
                        setTimeout(() => {
                            const popoverEls = document.querySelectorAll('.n-popover--raw');
                            const subPopoverEl = popoverEls.length > 1 ? popoverEls[popoverEls.length - 1]?.parentElement : null;
                            if (subPopoverEl) {
                                subPopoverEl.removeEventListener('mouseenter', onMenuHover);
                                subPopoverEl.addEventListener('mouseenter', onMenuHover);
                            }
                        }, 150);                        
                    }

                    function onMenuHover() {
                        setTimeout(() => {window.dispatchEvent(new CustomEvent('quick-launcher-changed'));}, 150);
                    }

                    const popoverEls = document.querySelectorAll('.n-popover--raw');
                    const topPopoverEl = popoverEls.length === 1 ? popoverEls[0] : null;

                    if (topPopoverEl) {
                        const primaryMenus = topPopoverEl.querySelectorAll('div[data-animation-icon-hover-target]');
                        primaryMenus.forEach((menuDom) => {
                            menuDom.addEventListener('mouseenter', onPrimaryMenuHover);
                        });
                    }

                    popoverEls.forEach((popEl) => {
                        const popoverEl = popEl.parentElement;
                
                        if (popoverEl.getBoundingClientRect().height > 0)
                        {
                            popoverEl.style['-webkit-app-region'] = 'no-drag';
                            const popoverDomRect = popoverEl.getBoundingClientRect();
                            if (popoverDomRect.y + popoverDomRect.height > inputDomRect.y + inputDomRectHeight) {
                                inputDomRectHeight = (popoverDomRect.y + popoverDomRect.height) - inputDomRect.y;
                            } else if (popoverDomRect.y < inputDomRect.y) {
                                inputDomRectHeight = (inputDomRect.y + inputDomRectHeight) - popoverDomRect.y;
                                inputDomRectTop = popoverDomRect.top;
                            }
                        }
                    });

                    return {
                        width: inputDomRect.width,
                        height: inputDomRectHeight,
                        top: inputDomRectTop,
                        left: inputDomRect.left
                    };
                })();
                `;
    }

    if (jsCode === '') return;

    const rect = await quickLauncherView.webContents.executeJavaScript(jsCode);

    quickLauncherView?.setBounds({
        x: (-rect.left + 16) * currentZoomFactor,
        y: (-rect.top + 16) * currentZoomFactor,
        width: 1200,
        height: 800
    });

    resizeQuickLauncher(quickLauncherWindow, (rect.width + 32) * currentZoomFactor, (rect.height + 32) * currentZoomFactor);
}

function resizeQuickLauncher(window, targetWidth, targetHeight) {
    if (!window) return;
    const newWidth = Math.ceil(targetWidth);
    const newHeight = Math.ceil(targetHeight);

    const [currentWidth, currentHeight] = window.getSize();
    if (currentWidth === newWidth && currentHeight === newHeight) return;

    const currentScreen = screen.getDisplayMatching(window.getBounds());
    const { x: sx, y: sy, width: sw, height: sh } = currentScreen.workArea;
    const currentBounds = window.getBounds();

    let newX = currentBounds.x;
    let newY = currentBounds.y;

    const windowCenterY = currentBounds.y + Math.floor(currentBounds.height / 2);
    const screenCenterY = sy + Math.floor(sh / 2);

    if (windowCenterY > screenCenterY) {
        newY = (currentBounds.y + currentBounds.height) - newHeight;

        if (newY < sy) newY = sy;
    }
    else {
        newY = currentBounds.y;

        if (newY + newHeight > sy + sh) {
            newY = (sy + sh) - newHeight;
        }
    }

    if (newX + newWidth > sx + sw) {
        newX = sx + sw - newWidth;
    }

    window.setBounds({
        x: Math.ceil(newX),
        y: Math.ceil(newY),
        width: newWidth,
        height: newHeight
    });
}

function startTrayAnimation() {
    if (animationTimer) {
        stopTrayAnimation();
    }

    if (cachedFrames.length === 0) {
        const imagePath = path.join(ICON_PATH);
        baseImage = nativeImage.createFromPath(imagePath);

        const traySize = process.platform === 'darwin' ? 22 : 32;
        const resizedBase = baseImage.resize({ width: traySize, height: traySize, quality: 'best' });

        const bitmap = resizedBase.toBitmap();
        const size = resizedBase.getSize();

        const opacities = [0.25, 0.50, 0.75, 1.00];

        cachedFrames = opacities.map(opacity => {
            if (opacity === 1.0) return resizedBase;

            const newBitmap = Buffer.from(bitmap);

            for (let i = 0; i < newBitmap.length; i += 4) {
                newBitmap[i + 3] = Math.round(newBitmap[i + 3] * opacity);
            }

            return nativeImage.createFromBuffer(newBitmap, {
                width: size.width,
                height: size.height
            });
        });
    }

    tray.setToolTip(APP_NAME + ' - Loading...');

    animationTimer = setInterval(() => {
        let frameIndex = currentStep;
        if (currentStep > 3) {
            frameIndex = 6 - currentStep;
        }

        if (tray && cachedFrames[frameIndex]) {
            tray.setImage(cachedFrames[frameIndex]);
        }

        currentStep = (currentStep + 1) % 6;
    }, 150);
}

function stopTrayAnimation() {
    if (animationTimer) {
        clearInterval(animationTimer);
        animationTimer = null;
    }

    if (tray && cachedFrames[3]) {
        tray.setImage(cachedFrames[3]);
        tray.setToolTip(APP_NAME);
    }

    currentStep = 0;
}

function createNewTabBackend(url) {
    const tabId = 'tab_' + Date.now();
    return createNewTabInstance(tabId, url, true);
}

function getCallerName() {
    const obj = {};
    Error.captureStackTrace(obj, getCallerName);

    const stack = obj.stack.split('\n');
    if (stack.length > 2) {
        return stack[2];
    }
    return 'unknown';
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

    mainWindow = new BaseWindow({
        width: 1200,
        height: 800,
        title: APP_NAME,
        icon: ICON_PATH,
        frame: DEFAULT_MAIN_WINDOW_FRAME,
        show: !getConfig('minimizeToTrayOnStartup'),
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
    titleBarView.webContents.loadFile(path.join(__dirname, 'index.html'));

    currentTheme = getConfig('theme') === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : getConfig('theme');

    mainWindow.on('resize', resizeViews);

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

    globalShortcut.register('CmdOrCtrl+Shift+Alt+Space', () => {
        trayPopUpContextMenu = true;
        showAppAndAddNewTab(getConfig('defaultAISupplier') ? getDefaultAISupplier().landingPage : getNextLandingPage(quickLauncherView?.webContents.getURL()));
    })

    tray = new Tray(ICON_PATH);

    tray.setToolTip(APP_NAME);
    tray.setContextMenu(createContextMenu(true));
    tray.on('click',
        () => {
            trayPopUpContextMenu = true;
            const iconDefaults = getConfig('iconDefaults');
            if (iconDefaults === null || iconDefaults === 'showHideWindow') {
                handleTrayClick();
            }
            else if (iconDefaults === 'openNewTab' || iconDefaults === 'openQuickLauncher') {
                if (isDefaultAISupplierSet()) {
                    showAppAndAddNewTab();
                } else {
                    const addTabMenu = Menu.buildFromTemplate(addTabItems);
                    addTabMenu.on('menu-will-close', () => {
                        updateMenus(true, false);
                    });
                    tray.setContextMenu(addTabMenu);
                    tray.popUpContextMenu();
                }
            }
        }
    );

    startTrayAnimation();

    if (!IS_LINUX) {
        mainWindow.on('enter-full-screen', () => {
            autoHideMenuBar();
        });

        mainWindow.on('leave-full-screen', () => {
            autoHideMenuBar();
        });
    }

    autoHideMenuBar();

    titleBarView.webContents.on('context-menu', (e, params) => {
        const defaultMenuTemplate = [
            { label: 'Inspect', click: () => titleBarView.webContents.inspectElement(params.x, params.y) }
        ];

        const menu = Menu.buildFromTemplate(defaultMenuTemplate);
        menu.popup();
    });
}

function getNextLandingPage(currentUrl) {
    const urlList = Object.values(constants.AI_SUPPLIERS).map(s => s.landingPage);

    if (!currentUrl) {
        return urlList[0];
    }

    const currentIndex = urlList.indexOf(currentUrl);
    if (currentIndex === -1) {
        return urlList[0];
    }

    const nextIndex = (currentIndex + 1) % urlList.length;

    return urlList[nextIndex];
}

function autoHideMenuBar() {
    const autoHideMenuBar = (getConfig('autoHideTitleBar') ?? false);
    mainWindow.setMenuBarVisibility(!autoHideMenuBar);
    mainWindow.setAutoHideMenuBar(autoHideMenuBar);
}

function toggleFullscreen() {
    const isFull = mainWindow.isFullScreen();

    mainWindow.setFullScreen(!isFull);

    if (IS_LINUX) {
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
    searchWin?.webContents.setZoomFactor(currentZoomFactor);
    quickLauncherView?.webContents.setZoomFactor(currentZoomFactor);
    setTimeout(() => { resizeSearchWindow(); quickLauncherChanged(); }, 150);

    appHeaderHeight = Math.round(baseAppHeaderHeight * currentZoomFactor);
    updateMenus();
}

async function isGeminiRealChatReady(webContents) {
    return await webContents.executeJavaScript(`
                !!(document.querySelector('.conversation-container') && document.querySelector('conversation-actions-icon') && document.querySelector('[trace="ChatContainer"]'))
                `);
}

async function isGoogleSearchAIModeRealChatReady(webContents) {
    return await webContents.executeJavaScript(`
                !!(document.querySelector('div[data-xid="aim-mars-turn-root"]') && document.querySelector('div[data-scope-id="turn"]') && document.querySelector('div[data-container-id="main-col"]') && document.querySelector('div[data-container-id="main-col"]').querySelector('div[style="display: contents"]').innerText.trim() !== '')
                `);
}

async function isDeepSeekRealChatReady(webContents) {
    return await webContents.executeJavaScript(`
                !!(document.querySelector('.ds-virtual-list-visible-items') && document.querySelector('div[data-virtual-list-item-key]'))
                `);
}

async function isKimiRealChatReady(webContents) {
    return await webContents.executeJavaScript(`
                !!(document.querySelector('.chat-content-list') && document.querySelector('.chat-content-item'))
                `);
}

async function triggerExport(type) {
    const activeTabView = getActiveTabView();

    if (isGeminiRealChatURL(activeTabView)) {
        if (await isGeminiRealChatReady(activeTabView.webContents)) {
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
                                            iframeElement.contentDocument.querySelector('.export-title').innerText += ' - Google Gemini';
                                            htmlContent = iframeElement.contentDocument.documentElement.innerHTML;
                                        } catch (err) {
                                            try {
                                                win.document.querySelector('.export-title').innerText += ' - Google Gemini';
                                                htmlContent = win.document.documentElement.innerHTML;
                                            } catch (err2) {
                                                document.querySelector('.export-title').innerText += ' - Google Gemini';
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
                } catch (e) {}
            })();
            `;

            activeTabView.webContents.executeJavaScript(jsCode);
        }
    } else if (isGoogleSearchAIModeRealChatURL(activeTabView)) {
        if (await isGoogleSearchAIModeRealChatReady(activeTabView.webContents)) {
            await blurActiveTabView(activeTabView);

            const jsCode = `(function() { try { 
            const turns = []; 
            const rawHTMLString = document.body.innerHTML; 
            const parser = new DOMParser(); 
            const tempDoc = parser.parseFromString(rawHTMLString, 'text/html'); 
            const turnItems = tempDoc.querySelector('div[data-xid="aim-mars-turn-root"]')?.querySelectorAll('div[data-scope-id="turn"]'); 
            
            (turnItems ?? []).forEach((turnItem) => { 
                let promptEl = null; 
                if (turnItem.innerHTML.includes('You said:')) { 
                    const spans = turnItem.querySelectorAll('span:not([class])'); 
                    promptEl = Array.from(spans ?? []).filter(el => el && el.innerText && el.innerText.trim() !== ''); 
                } else { 
                    const streamingContainer = turnItem.closest('div[data-streaming-container]'); 
                    const spans = streamingContainer ? streamingContainer.querySelectorAll('span:not([class])') : []; 
                    promptEl = Array.from(spans ?? []).filter(el => el && el.innerText && el.innerText.trim() !== ''); 
                } 

                const promptText = promptEl && promptEl[0] && promptEl[0].innerText ? promptEl[0].innerText.trim() : ""; 
                
                let ignored = []; 
                const divs = turnItem.querySelector('div[data-container-id="main-col"]')?.querySelectorAll('ul,ol,table,span,div[data-sfc-root="ep"]:not([data-container-id]):not([data-animation-skip]):not([style*="display:none"]):not([style*="display: none"]):not(:has(table))'); 
                
                let responses = Array.from(divs ?? []).filter(el => { 
                    if (ignored.includes(el)) { return false; } 
                    const txt = el.innerText ? el.innerText.trim() : ""; 
                    if (txt === '') return false; 

                    if (!el.hasAttribute('data-sfc-root') || el.getAttribute('data-sfc-root') !== 'ep') {
                        const isPartofAIBody = el.closest('div[data-sfc-root="ep"]') !== null;
                        if (!isPartofAIBody) {
                        return false;
                        }
                    }

                    if (el.tagName === 'BUTTON' || el.tagName === 'SVG' || el.tagName === 'IMG' || el.tagName === 'FORM') {
                        return false;
                    }
                    
                    el.querySelectorAll('span').forEach(span => { 
                        const innerButton = span.querySelector('button'); 
                        if (innerButton) { 
                            const buttonHasGraphics = innerButton.querySelector('img') !== null || innerButton.querySelector('svg') !== null; 
                            if (buttonHasGraphics) { span.remove(); } 
                        } 
                    }); 
                    
                    if (!el.hasAttribute('data-sfc-root')) { 
                        const outerButton = el.closest('button'); 
                        const belongsToAnchor = el.closest('a') !== null; 
                        const containsImage = el.querySelector('img') !== null || el.querySelector('svg') !== null || el.tagName === 'IMG'; 
                        if (outerButton || (belongsToAnchor || containsImage)) { return false; } 
                    } 
                    
                    let result = el.innerText.trim() !== '' && (el.tagName !== 'SPAN' || (el.tagName === 'SPAN' && el.querySelector('button') === null)); 
                    if (result) { 
                        const ig = el.querySelectorAll('span'); 
                        ignored = [...ignored, ...Array.from(ig)]; 
                    } 
                    return result; 
                }); 

                for (let i = responses.length - 1; i >= 0; i--) { 
                    const currentEl = responses[i]; 

                    const hasClutterControls = currentEl.querySelector('button') || currentEl.querySelector('svg') || currentEl.querySelector('form') || currentEl.tagName === 'FORM';
                    const hasSystemFeedbackAttributes = currentEl.querySelector('[aria-label*="feedback"]') || currentEl.querySelector('[aria-label*="share"]') || currentEl.querySelector('a[href*="privacy"]') || currentEl.querySelector('a[href*="terms"]') || currentEl.querySelector('a[href*="support"]');
                    
                    if (hasClutterControls || hasSystemFeedbackAttributes) { 
                        responses.splice(i, 1);
                    } 
                }

                function htmlEscape(codeString) {
                    const div = document.createElement('div');
                    div.textContent = codeString;
                    return div.innerHTML;
                }

                const allowedTags = ['STRONG', 'CODE', 'UL', 'OL', 'LI', 'TABLE', 'TBODY', 'TH', 'TR', 'TD'];

                function cleanNode(node) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        return node.nodeValue;
                    }

                    if (node.nodeType === Node.ELEMENT_NODE) {
                        let childContent = '';
                        node.childNodes.forEach(child => {
                        childContent += cleanNode(child);
                        });

                        const tagName = node.tagName;
                        if (allowedTags.includes(tagName)) {
                            const lowerTag = tagName.toLowerCase();

                            if (lowerTag === 'code') {
                                return '<div class="code-block-wrapper"><pre><' + lowerTag + '>' + htmlEscape(childContent) + '</' + lowerTag + '></pre></div>';
                            } else {
                                return '<' + lowerTag + '>' + childContent + '</' + lowerTag + '>';
                            }
                        } else if (tagName === 'DIV' && node.getAttribute('role') === 'heading') {
                            const level = node.getAttribute('aria-level');

                            if (level) {
                                return '<h' + level + '>' + childContent + '</h' + level + '>';
                            }
                        }

                        return childContent;
                    }

                    return '';
                }
                
                let responseText = responses.map(res => {
                        if (res.innerText) {
                            const text = cleanNode(res);

                            return text.replace(/Use code with caution./g, '');
                        } else {
                            return "";
                        }
                    }).filter(t => t !== "").join('\\n'); 

                if (promptText || responseText) { 
                    turns.push({ promptText: promptText, responseText: responseText }); 
                } 
            }); 
            
            const chatData = { title: document.title || "AI CHAT LOG", url: document.location.href, dialogues: turns }; 
            
            return chatData;
            } catch (e) {} })();`;

            const chatData = await activeTabView.webContents.executeJavaScript(jsCode);

            let dialoguesHtml = "";
            chatData.dialogues.forEach((round, index) => {
                dialoguesHtml += '<div class="chat-section prompt-section">' +
                    '<div class="section-label">User Prompt #' + (index + 1) + '</div>' +
                    '<div class="content">' + round.promptText + '</div>' +
                    '</div>' +
                    '<div class="chat-section response-section">' +
                    '<div class="section-label">AI Response #' + (index + 1) + '</div>' +
                    '<div class="content">' + round.responseText;

                dialoguesHtml += '</div></div>';
            });

            const htmlContent = '<!DOCTYPE html><html lang="und"><head><meta charset="UTF-8"><title>' + chatData.title + '</title>' +
                '<style>@page { size: A4; margin: 0; } body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; margin: 0; padding: 50px; color: #1e293b; background-color: #ffffff; line-height: 1.6; font-size: 15px;} .file-banner { font-size: 12px; font-weight: 600; color: #64748b; padding-bottom: 12px; margin-bottom: 35px; border-bottom: 1px solid #e2e8f0; letter-spacing: 1px; text-transform: uppercase;} pre { font-family: "Consolas", "Fira Code", "Courier New", monospace; font-size: 13px; line-height: 1.5; color: #0f172a; white-space: pre-wrap; word-break: break-all; margin: 0; } a .export-title { font-size: 24px; font-weight: 700; color: #0f172a; margin-bottom: 30px; } .chat-section { margin-bottom: 25px; border-radius: 8px; padding: 20px; } .prompt-section { background-color: #f8fafc; border-left: 4px solid #64748b; } .response-section { background-color: #ffffff; border-left: 4px solid #3b82f6; border: 1px solid #f1f5f9; } .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; } .prompt-section .section-label { color: #64748b; } .response-section .section-label { color: #3b82f6; } .content { color: #334155; font-size: 15px; white-space: pre-wrap; } .code-block-wrapper { margin: 8px; padding: 16px; display: inline-flex; align-items: center; vertical-align: middle; background-color: #f1f5f9; border-radius: 4px; border: 1px solid #e2e8f0; } .code-block-wrapper pre { display: inline; font-size: 0.9em; font-family: "Consolas", "Fira Code", "Courier New", monospace; color: #0f172a; white-space: pre; word-break: normal; margin: 0; white-space: pre-wrap; word-wrap: break-word; word-break: break-all; } table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; } th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; color: #334155; } th { background-color: #f8fafc; color: #0f172a; font-weight: 600; } tr:nth-child(even) { background-color: #fdfdfd; } </style></head>' +
                '<body><div class="file-banner">AI CHAT LOG</div><a href="' + chatData.url + '"><h1 class="export-title">' + chatData.title + '</h1></a>' + dialoguesHtml + '</body></html>';

            await exportHTMLContent(activeTabView.webContents, htmlContent, type);
        }
    } else if (isDeepSeekRealChatURL(activeTabView)) {
        if (await isDeepSeekRealChatReady(activeTabView.webContents)) {
            await blurActiveTabView(activeTabView);

            const executionResult = await activeTabView.webContents.executeJavaScript(`
                new Promise((resolve) => {
                    window.dispatchEvent(new Event('beforeprint'));

                    setTimeout(() => {
                        const mainLinkElement = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
                    .find(el => el.href && el.href.includes('/main.'));

                const dynamicCssUrl = mainLinkElement ? mainLinkElement.href : "";
                         resolve({
                    html: document.documentElement.innerHTML,
                    cssUrl: dynamicCssUrl,
                    title: document.title,
                    headerCssName: document.querySelector('.the-header').parentElement.classList.value
                });
                    }, 150); 
                });
            `);

            const htmlContent = executionResult.html;
            const dynamicCssUrl = executionResult.cssUrl;
            const title = executionResult.title;
            const headerCssName = executionResult.headerCssName;

            if (dynamicCssUrl) {
                try {
                    const response = await net.fetch(dynamicCssUrl);
                    remoteCssText = await response.text();
                } catch (netErr) { }
            }

            let extractedPrintStyles = "";
            if (remoteCssText) {
                let index = 0;
                const target = "@media print";

                while ((index = remoteCssText.toLowerCase().indexOf(target, index)) !== -1) {
                    let startBrace = remoteCssText.indexOf("{", index + target.length);
                    if (startBrace === -1) break;

                    let braceCount = 1;
                    let currentPos = startBrace + 1;
                    let innerContent = "";

                    while (braceCount > 0 && currentPos < remoteCssText.length) {
                        let char = remoteCssText[currentPos];
                        if (char === "{") {
                            braceCount++;
                        } else if (char === "}") {
                            braceCount--;
                        }

                        if (braceCount > 0) {
                            innerContent += char;
                        }
                        currentPos++;
                    }

                    if (innerContent) {
                        extractedPrintStyles += innerContent.trim() + "\n";
                    }

                    index = currentPos;
                }
            }

            const forcedPrintStyles = `
                <style>
                    html, body, #app, #root, [class*="container"], [class*="wrapper"], main, section {
                        height: auto !important;
                        max-height: none !important;
                        overflow: visible !important;
                        position: static !important;
                        display: block !important;
                        background: #fff !important;
                    }
                    .export-title {
                        display: none !important;
                    }
                    .${headerCssName} {display: flex !important;}
                    ${remoteCssText}
                    ${extractedPrintStyles}
                </style>
                <h1 class="export-title">${title}</h1>
                `;

            await exportHTMLContent(activeTabView.webContents, htmlContent + forcedPrintStyles, type);
        }
    } else if (isKimiRealChatURL(activeTabView)) {
        if (await isKimiRealChatReady(activeTabView.webContents)) {
            await blurActiveTabView(activeTabView);

            const jsCode = `(async function() { try { 
            function fetchIframeHtml(iframeSrc) {
                return new Promise((resolve) => {
                    const requestId = 'req_' + Date.now();

                    function onUiCallback(event) {
                        if (event.detail && event.detail.requestId === requestId) {
                            const htmlData = event.detail.html;
                            window.removeEventListener('net-fetch-html-response', onUiCallback);
                            resolve(htmlData);
                        }
                    }
                    window.addEventListener('net-fetch-html-response', onUiCallback);

                    const eventData = {
                        requestId: requestId,
                        src: iframeSrc
                    };

                    const customEvent = new CustomEvent('net-fetch-html-request', { detail: eventData });
                    window.dispatchEvent(customEvent);

                    setTimeout(() => {
                        window.removeEventListener('net-fetch-html-response', onUiCallback);
                        resolve(null); 
                    }, 5000);
                });
            }

            const turns = []; 
            const turnItems = document.querySelector('.chat-content-list')?.querySelectorAll('.chat-content-item'); 
            
            let promptText = '';
            let responseText = '';
            for (const turnItem of (turnItems ?? [])) { 
                const classList = Array.from(turnItem.classList);
                
                if (classList.includes('chat-content-item-user')) {
                    promptText = turnItem.querySelector('.user-content').innerHTML;
                    responseText = '';
                } else if (classList.includes('chat-content-item-assistant')) {
                    const responseEls = turnItem.querySelectorAll('.markdown-container:not(.toolcall-content-text),.toolcall-content-text,.widget-sandbox,.ipython-images-container');
                    for (const responseEl of (responseEls ?? [])) { 
                        if (Array.from(responseEl.classList).includes('toolcall-content-text')) {
                            responseText += ('<div class="code-block-wrapper">' + responseEl.innerHTML + '</div>')
                        } else if (Array.from(responseEl.classList).includes('widget-sandbox')) {
                            const iframeSrc = responseEl.querySelector('iframe').src;
                            const rawHTMLString = await fetchIframeHtml(iframeSrc);

                            const parser = new DOMParser(); 
                            const tempDoc = parser.parseFromString(rawHTMLString, 'text/html'); 
                            responseText += tempDoc.getElementById('widget-root').innerHTML;
                        } else if (Array.from(responseEl.classList).includes('ipython-images-container')) {
                            for (const img of (responseEl.querySelectorAll('img[loading="lazy"]') ?? [])) {
                                img.setAttribute('loading', 'eager');
                            }

                            responseText += responseEl.innerHTML;
                        } else {
                            responseText += responseEl.innerHTML;
                        }
                    }; 
                }

                if (promptText && responseText) { 
                    turns.push({ promptText: promptText, responseText: responseText }); 
                } 
            }; 
            
            const chatData = { title: document.title || "AI CHAT LOG", url: document.location.href, dialogues: turns }; 
            
            return chatData;
            } catch (e) {} })();`;

            const chatData = await activeTabView.webContents.executeJavaScript(jsCode);

            let dialoguesHtml = "";
            chatData.dialogues.forEach((round, index) => {
                dialoguesHtml += '<div class="chat-section prompt-section">' +
                    '<div class="section-label">User Prompt #' + (index + 1) + '</div>' +
                    '<div class="content">' + round.promptText + '</div>' +
                    '</div>' +
                    '<div class="chat-section response-section">' +
                    '<div class="section-label">AI Response #' + (index + 1) + '</div>' +
                    '<div class="content">' + round.responseText;

                dialoguesHtml += '</div></div>';
            });

            const htmlContent = '<!DOCTYPE html><html lang="und"><head><meta charset="UTF-8"><title>' + chatData.title + '</title>' +
                '<style>@page { size: A4; margin: 0; } body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; margin: 0; padding: 50px; color: #1e293b; background-color: #ffffff; line-height: 1.6; font-size: 15px;} .file-banner { font-size: 12px; font-weight: 600; color: #64748b; padding-bottom: 12px; margin-bottom: 35px; border-bottom: 1px solid #e2e8f0; letter-spacing: 1px; text-transform: uppercase;} pre { font-family: "Consolas", "Fira Code", "Courier New", monospace; font-size: 13px; line-height: 1.5; color: #0f172a; white-space: pre-wrap; word-break: break-all; margin: 0; } a .export-title { font-size: 24px; font-weight: 700; color: #0f172a; margin-bottom: 30px; } .chat-section { margin-bottom: 25px; border-radius: 8px; padding: 20px; } .prompt-section { background-color: #f8fafc; border-left: 4px solid #64748b; } .response-section { background-color: #ffffff; border-left: 4px solid #3b82f6; border: 1px solid #f1f5f9; } .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; } .prompt-section .section-label { color: #64748b; } .response-section .section-label { color: #3b82f6; } .content { color: #334155; font-size: 15px; white-space: pre-wrap; } .code-block-wrapper, pre { margin: 8px; padding: 16px; display: inline-flex; align-items: center; vertical-align: middle; background-color: #f1f5f9; border-radius: 4px; border: 1px solid #e2e8f0; } .code-block-wrapper pre, pre code { display: inline; font-size: 0.9em; font-family: "Consolas", "Fira Code", "Courier New", monospace; color: #0f172a; white-space: pre; word-break: normal; margin: 0; white-space: pre-wrap; word-wrap: break-word; word-break: break-all; } table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; } th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; color: #334155; } th { background-color: #f8fafc; color: #0f172a; font-weight: 600; } tr:nth-child(even) { background-color: #fdfdfd; } img + div {padding-bottom: 0px !important; display: none} </style></head>' +
                '<body><div class="file-banner">AI CHAT LOG</div><a href="' + chatData.url + '"><h1 class="export-title">' + chatData.title + '</h1></a>' + dialoguesHtml + '</body></html>';

            await exportHTMLContent(activeTabView.webContents, htmlContent, type);
        }
    } else {
        await dialog.showMessageBox(mainWindow, {
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
    const entries = Object.entries(constants.AI_SUPPLIERS);

    let newTabItem = null;
    let quickLauncherItem = null;
    addTabItems = [];

    if (isDefaultAISupplierSet()) {
        const defaultAISupplier = getDefaultAISupplier();
        newTabItem = {
            id: 'm-newtab',
            label: 'New Tab - ' + defaultAISupplier.label,
            click: () => {
                showAppAndAddNewTab();
            }
        };
        quickLauncherItem = {
            id: 'm-newQuickLauncher',
            label: 'New Quick Launcher - ' + defaultAISupplier.label,
            click: () => {
                showAppAndAddNewTab(null, true);
            }
        };
    } else {
        const addLauncherItems = [];
        entries.map(([key, value]) => {
            addTabItems.push({
                id: 'm-newtab-' + value.id,
                label: value.label,
                click: () => {
                    showAppAndAddNewTab(value.landingPage);
                }
            });

            addLauncherItems.push({
                id: 'm-newQuickLauncher-' + value.id,
                label: value.label,
                click: () => {
                    showAppAndAddNewTab(value.landingPage, true);
                }
            })
        });

        newTabItem = {
            id: 'm-newtab',
            label: 'New Tab',
            submenu: addTabItems
        };

        quickLauncherItem = {
            id: 'm-newQuickLauncher',
            label: 'New Quick Launcher',
            submenu: addLauncherItems
        };
    }

    const exitItem = {
        id: "m-exit",
        label: 'Exit',
        click: async () => {
            await quitApp(true);
        }
    };

    const separatorItem = { type: 'separator' };

    if (isTray) {
        menuTemplate.push(newTabItem);
        menuTemplate.push(quickLauncherItem);
        menuTemplate.push(separatorItem);
    }
    else {
        const exportItems = {
            id: "export-menu",
            label: IS_MAC ? 'Export...' : 'Export',
            submenu: [
                {
                    id: "m-exprot-html",
                    label: 'Html',
                    click: (menuItem) => {
                        triggerExport('html');
                    }
                },
                {
                    id: "m-exprot-pdf",
                    label: 'PDF',
                    click: (menuItem) => {
                        triggerExport('pdf');
                    }
                }
            ]
        };

        menuTemplate.push({
            id: "file-menu",
            label: 'File',
            submenu: [newTabItem, quickLauncherItem, separatorItem, exportItems, separatorItem, exitItem]
        });
    }

    const toggleWindowVisibilityItem = {
        id: 'toggle-window-visibility',
        visible: !IS_LINUX,
        enabled: !IS_LINUX,
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
                    visible: !IS_LINUX,
                    enabled: !IS_LINUX,
                    accelerator: 'CmdOrCtrl+Shift+M',
                    click: (menuItem) => {
                        toggleTitleBar();
                    }
                }
            ]
        };
        menuTemplate.push(viewItem);

        const landingPageItems = [{
            id: "m-nta-let-me-choose",
            label: 'Let Me Choose',
            type: 'radio',
            checked: !isDefaultAISupplierSet(),
            click: (menuItem) => {
                saveConfig('defaultAISupplier', '');
                saveConfig('openNewTabOnStartup', !menuItem.checked);
                updateMenus(true);
            }
        },
            separatorItem
        ];
        const entries = Object.entries(constants.AI_SUPPLIERS);
        entries.forEach(([key, value]) => {
            landingPageItems.push({
                id: value.id,
                label: value.label,
                type: 'radio',
                checked: isDefaltAISupplier(value.id),
                click: (menuItem) => {
                    saveConfig('defaultAISupplier', value.id);
                    updateMenus(true);
                }
            });
        });

        const settingsItem = {
            id: "setting-menu",
            label: IS_MAC ? 'Settings...' : 'Settings',
            submenu: [
                {
                    id: "m-new-tab-action",
                    label: "New Tab Action",
                    submenu: landingPageItems
                },
                {
                    id: "m-startup-behavior",
                    label: "On Startup Behavior",
                    submenu: [
                        {
                            id: "m-sb-open-new-tab-on-startup",
                            label: 'Open New Tab - ' + (isDefaultAISupplierSet() ? getDefaultAISupplier().label : 'Let Me Choose...'),
                            type: 'checkbox',
                            enabled: isDefaultAISupplierSet(),
                            checked: !isDefaultAISupplierSet() || getConfig('openNewTabOnStartup'),
                            click: (menuItem) => {
                                saveConfig('openNewTabOnStartup', menuItem.checked);
                                updateMenus();
                            }
                        },
                        {
                            id: "m-sb-tray",
                            label: 'Minimize to Tray',
                            visible: !IS_LINUX,
                            type: 'checkbox',
                            checked: getConfig('minimizeToTrayOnStartup'),
                            click: (menuItem) => {
                                saveConfig('minimizeToTrayOnStartup', menuItem.checked);
                                updateMenus();
                            }
                        }
                    ]
                },
                {
                    id: "m-close-behavior",
                    label: "On Close Behavior",
                    visible: !IS_MAC,
                    submenu: [
                        {
                            id: "m-cb-ask",
                            label: 'Always Ask',
                            type: 'radio',
                            checked: (!getConfig('minimizeToTrayOnClose') || IS_LINUX) && !getConfig('exitDontAskAgain'),
                            click: (menuItem) => {
                                if (!IS_LINUX) {
                                    saveConfig('minimizeToTrayOnClose', !menuItem.checked);
                                }
                                saveConfig('exitDontAskAgain', !menuItem.checked);
                                updateMenus();
                            }
                        },
                        {
                            id: "m-cb-tray",
                            label: 'Minimize to Tray',
                            visible: !IS_LINUX,
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
                                if (!IS_LINUX) {
                                    saveConfig('minimizeToTrayOnClose', !menuItem.checked);
                                }
                                saveConfig('exitDontAskAgain', menuItem.checked);
                                updateMenus();
                            }
                        }
                    ]
                },
                {
                    id: "m-tray-behavior",
                    label: "Tray Icon Behavior",
                    visible: !IS_LINUX,
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
                            label: 'Open New Tab - ' + (isDefaultAISupplierSet() ? getDefaultAISupplier().label : 'Let Me Choose...'),
                            type: 'radio',
                            checked: getConfig('iconDefaults') === 'openNewTab',
                            click: (menuItem) => {
                                saveConfig('iconDefaults', 'openNewTab');
                                updateMenus();
                            }
                        },
                        {
                            id: "m-tb-quick-launcher",
                            label: 'Open Quick Launcher - ' + (isDefaultAISupplierSet() ? getDefaultAISupplier().label : 'Let Me Choose...'),
                            type: 'radio',
                            checked: getConfig('iconDefaults') === 'openQuickLauncher',
                            click: (menuItem) => {
                                saveConfig('iconDefaults', 'openQuickLauncher');
                                updateMenus();
                            }
                        }
                    ]
                }
            ]
        };
        menuTemplate.push(settingsItem);

        const helpItem = {
            id: "help-menu",
            label: 'Help',
            submenu: [
                {
                    id: "m-help-report-issue",
                    label: "Report Issue",
                    click: (menuItem) => {
                        createNewTabBackend(getAppWebsiteFullURL('issues'));
                    }
                },
                separatorItem,
                {
                    id: "m-help-view-license",
                    label: "View License",
                    click: (menuItem) => {
                        createNewTabBackend(getAppWebsiteFullURL(`?tab=MIT-1-ov-file#MIT-1-ov-file`));
                    }
                },
                {
                    id: "m-help-disclaimer-statement",
                    label: "Disclaimer Statement",
                    click: (menuItem) => {
                        createNewTabBackend(getAppWebsiteFullURL(`?tab=readme-ov-file#%EF%B8%8F-disclaimer`));
                    }
                },
                separatorItem,
                {
                    id: "m-help-check-for-updates",
                    label: "Check for Updates...",
                    click: async (menuItem) => {
                        await checkForUpdates();
                    }
                },
                separatorItem,
                {
                    id: "m-help-about",
                    label: "About (V" + app.getVersion() + ')',
                    click: (menuItem) => {
                        createNewTabBackend(getAppWebsiteFullURL(''));
                    }
                }
            ]
        };
        menuTemplate.push(helpItem);

        barMenusTemplate = menuTemplate;
    }

    return Menu.buildFromTemplate(menuTemplate);
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
            const updateChoice = await dialog.showMessageBox(mainWindow, {
                type: 'info',
                buttons: ['Download Now', 'Later'],
                defaultId: 0,
                cancelId: 1,
                title: 'Update Available',
                message: 'A new version of ' + APP_NAME + ' (V' + latestVersion.version + ') is available.',
                detail: 'New features and bug fixes are available in this version.\n\nWould you like to open the download page now?'
            });

            if (updateChoice.response === 0) {
                createNewTabBackend(downloadUrl);
            }
        } else {
            await dialog.showMessageBox(mainWindow, {
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
        await dialog.showMessageBox(mainWindow, {
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

function updateMenuBar() {
    menuItemsRegistry.clear();
    registerMenuItems(barMenusTemplate);

    const jsonReadyData = prepareTemplateForRenderer(barMenusTemplate);
    const hideTitleBar = getConfig('autoHideTitleBar');
    const tabbarIsHidden = baseAppHeaderHeight === (DEFAULT_APP_HEADER_HEIGHT - DEFAULT_TITLE_BAR_HEIGHT);
    const addTabJsonReadyData = prepareTemplateForRenderer(addTabItems);

    baseAppHeaderHeight = hideTitleBar
        ? (tabbarIsHidden ? baseAppHeaderHeight : baseAppHeaderHeight - DEFAULT_TITLE_BAR_HEIGHT)
        : (tabbarIsHidden ? baseAppHeaderHeight + DEFAULT_TITLE_BAR_HEIGHT : baseAppHeaderHeight);

    appHeaderHeight = Math.round(baseAppHeaderHeight * currentZoomFactor);

    titleBarView.webContents.send('update-menus', { jsonReadyData, hideTitleBar, addTabJsonReadyData });
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
                .replace(/CmdOrCtrl|CommandOrControl/g, IS_MAC ? '⌘' : 'Ctrl')
                .replace(/Shift/g, IS_MAC ? '⇧' : 'Shift')
                .replace(/Alt/g, IS_MAC ? '⌥' : 'Alt')
                .replace(/Option/g, IS_MAC ? '⌥' : 'Alt');

            if (IS_MAC) {
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

async function autoSetTitleBar() {
    await titleBarView.webContents.executeJavaScript(`document.querySelector('.window-title-bar').style.display 
        = ${(getConfig('autoHideTitleBar') ?? false) ? '"none"' : '"flex"'};`);
    autoHideMenuBar();
    updateMenuBar();
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

        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
        if (searchWin && !searchWin.isDestroyed()) searchWin.hide();

        updateMenus(true);
    }
    else if (!getConfig("exitDontAskAgain")) {
        const choice = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            buttons: ['Exit', 'Exit & Don\'t Ask Again', 'Cancel'],
            defaultId: 0,
            cancelId: 2,
            title: 'Confirm Exit',
            message: 'Are you sure you want to exit ' + APP_NAME + '?',
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

function checkGeminiRealChatURL(currentURL) {
    const geminiChatRegex = /gemini\.google\.com\/app\/[0-9a-fA-F]{16}/;

    return geminiChatRegex.test(currentURL);
}

function isGeminiRealChatURL(tabView) {
    if (!tabView || !tabView.webContents) return false;

    return checkGeminiRealChatURL(tabView.webContents.getURL());
}

function isDeepSeekRealChatURL(tabView) {
    if (!tabView || !tabView.webContents) return false;

    const currentURL = tabView.webContents.getURL();
    return checkDeepSeekRealChatURL(currentURL);
}

function checkDeepSeekRealChatURL(currentURL) {
    const dsChatRegex = /chat\.deepseek\.com\/a\/chat\/s\/([0-9a-fA-F]{16}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

    return dsChatRegex.test(currentURL);
}

function isKimiRealChatURL(tabView) {
    if (!tabView || !tabView.webContents) return false;

    const currentURL = tabView.webContents.getURL();
    return checkKimiRealChatURL(currentURL);
}

function checkKimiRealChatURL(currentURL) {
    const kimiChatRegex = /www\.kimi\.com\/chat\/([0-9a-fA-F]{16}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

    return kimiChatRegex.test(currentURL);
}

function isGoogleSearchAIModeRealChatURL(tabView) {
    if (!tabView || !tabView.webContents) return false;

    const currentURL = tabView.webContents.getURL();
    return checkGoogleSearchAIModeRealChatURL(currentURL);
}

function checkGoogleSearchAIModeRealChatURL(currentURL, ignoreExtraParams = false) {
    const targetUrl = new URL(constants.AI_SUPPLIERS.G_SEACH_AI_MODE.landingPage);
    const currentUrlObj = new URL(currentURL);

    const isBaseMatch = currentUrlObj.origin === targetUrl.origin &&
        currentUrlObj.pathname === targetUrl.pathname;

    const targetParams = targetUrl.searchParams;
    const currentParams = currentUrlObj.searchParams;
    const extraParams = new URLSearchParams([['q', ''], ['mstk', '']]);

    const isQueryMatch = Array.from(targetParams.keys()).every(key => currentParams.has(key) && currentParams.get(key) === targetParams.get(key)
    );
    const isExtraMatch = Array.from(extraParams.keys()).every(key => currentParams.has(key));

    return isBaseMatch && isQueryMatch && (isExtraMatch || ignoreExtraParams);
}

function createNewTabInstance(id, url, sendMsg = false) {
    if (!mainWindow) return;

    const blankTabId = Array.from(tabsMap.entries()).find(([id, tab]) => tab.webContents.getURL() === 'about:blank')?.[0];
    if (blankTabId) {
        closeTab(blankTabId);
        titleBarView?.webContents.send('old-tab-closed', blankTabId);
    }

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
        injectLocalStorage(tabView, ['Bard-Color-Theme', '__appKit_@deepseek/chat_themePreference', 'CUSTOM_THEME']);
    });

    if (sendMsg) {
        titleBarView?.webContents.send('new-tab-created', { id, url });
    }

    currentZoomFactor = titleBarView.webContents.getZoomFactor();

    tabView.webContents.on('found-in-page', (event, result) => {
        if (searchWin && result.activeMatchOrdinal !== undefined) {
            searchWin.webContents.send('search-result-data', {
                active: result.activeMatchOrdinal,
                total: result.matches
            });
        }
    });

    tabView.webContents.on('before-input-event', async (event, input) => {
        if (input.type === 'keyDown') {
            const isCmdOrCtrl = input.meta || input.control;
            const key = input.key.toLowerCase();

            if (isCmdOrCtrl) {
                if (key === 'f') {
                    event.preventDefault();
                    createSearchWindow(tabView);
                } else if (key === 'r') {
                    event.preventDefault();
                    reloadTabView(tabView.webContents);
                }
            } else if (input.alt) {
                if (key === 'arrowleft') {
                    event.preventDefault();
                    tabView.webContents.navigationHistory.goBack();
                } else if (key === 'arrowright') {
                    event.preventDefault();
                    tabView.webContents.navigationHistory.goForward();
                }
            } else if (key === 'f5') {
                event.preventDefault();
                reloadTabView(getActiveTabView()?.webContents);
            } else if (key === 'f12') {
                event.preventDefault();
                getActiveTabView()?.webContents.openDevTools({ mode: 'detach' });
            }
        }
    });

    toggleApplicationTheme(getConfig('theme') ?? 'system');

    return tabView;
}

function reloadTabView(webContents) {
    webContents?.reload();
}

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

        setTimeout(() => {
            activeTabView.webContents?.focus();
        }, 150);
    }
}

function convertHtmlImagesToBase64(htmlContent, eventSenderWebContents, outerHTML = true) {
    return new Promise(async (resolve, reject) => {
        let workerWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                offscreen: true,
            }
        });

        const tempFilePath = path.join(app.getPath('temp'), `worker_temp_${Date.now()}.html`);
        await fs.promises.writeFile(tempFilePath, htmlContent, 'utf-8');

        workerWindow.loadURL(`file://${tempFilePath}`);

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
                                'Referer': `${new URL(imgUrls).origin}/`,
                                'Accept': 'image/avif,image/webp,image/png,image/*,*/*;q=0.8'
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
    return new Promise(async (resolve, reject) => {
        let workerWindow = new BrowserWindow({
            show: false
        });

        const tempFilePath = path.join(app.getPath('temp'), `worker_temp_${Date.now()}.html`);
        await fs.promises.writeFile(tempFilePath, embeddedHtmlContent, 'utf-8');

        workerWindow.loadURL(`file://${tempFilePath}`);

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

async function blurActiveTabView(activeTab = null) {
    if (!activeTab) activeTab = getActiveTabView();
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

function parseAcceptToFilters(acceptStr) {
    if (!acceptStr) return [];

    const extensions = CONVERTIBLE_TO_PDF_EXTS;
    const items = acceptStr.split(',');

    items.forEach(item => {
        const trimmed = item.trim().toLowerCase();
        if (trimmed.startsWith('.')) {
            extensions.push(trimmed.substring(1));
        }

        else if (trimmed.includes('/')) {
            const ext = trimmed.split('/')[1];
            if (ext && ext !== '*') {
                extensions.push(ext);
            }
        }
    });

    const uniqueExts = Array.from(new Set(extensions));
    if (uniqueExts.includes('jpeg') && !uniqueExts.includes('jpg')) uniqueExts.push('jpg');

    return [{ name: 'Custom Files', extensions: uniqueExts }];
}

function getExactMimeType(ext) {
    const map = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.pdf': 'application/pdf',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.avif': 'image/avif',
        '.heic': 'image/heic',
        '.heif': 'image/heif'
    };
    return map[ext] || 'application/octet-stream';
}

function strictSafeFilename(userInputName, defaultTitle) {
    let safeName = userInputName.replace(/[\/\\:*?"<>|]/g, '_');

    safeName = safeName.replace(/^\.+/, '');

    const encoder = new TextEncoder();
    const decoder = new TextDecoder("utf-8");
    let buf = encoder.encode(safeName);

    if (buf.length > 255) {
        safeName = decoder.decode(buf.slice(0, 255));
    }

    return safeName || defaultTitle;
}

async function exportHTMLContent(sender, htmlContent, type) {
    await blurActiveTabView();
    const focusedWindow = BrowserWindow.getFocusedWindow();

    let fileTitle = 'exported_conversation';
    let filters = { name: 'All (*.*)', extensions: [''] };
    let content = '';

    try {
        const match = htmlContent.match(/<h1 class="export-title">([\s\S]*?)<\/h1>/);

        if (match) {
            fileTitle = strictSafeFilename(match[1].trim(), fileTitle);
        }

        switch (type) {
            case 'html':
                content = await convertHtmlImagesToBase64(htmlContent, sender);
                filters = { name: 'HTML Document (*.' + type + ';*.htm)', extensions: [type, 'htm'] };
                break;
            case 'pdf':
                content = await generatePdfFromEmbeddedHtml(await convertHtmlImagesToBase64(htmlContent, sender));
                filters = { name: 'PDF Document (*.' + type + ')', extensions: [type] };
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
            await fs.promises.writeFile(filePath, content, 'utf-8');
            const notice = new Notification({
                title: 'Export Success',
                body: 'Your file is ready.',
                silent: false,
                icon: ICON_PATH
            })

            notice.show()
        }

    } catch (err) { }
}

function createSearchWindow(tabView) {
    if (searchWin) {
        searchWin.focus();
        return;
    }

    const winBounds = mainWindow.getContentBounds();

    searchWin = new BrowserWindow({
        width: 320 * currentZoomFactor,
        height: 40 * currentZoomFactor,
        x: winBounds.x + winBounds.width - (320 * currentZoomFactor),
        y: winBounds.y + appHeaderHeight,
        parent: mainWindow,
        frame: false,
        resizable: false,
        transparent: true,
        alwaysOnTop: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload-ui.js')
        }
    });

    searchWin.loadFile(path.join(__dirname, 'search.html'));

    searchWin.on('closed', () => {
        searchWin = null;
        if (tabView) tabView.webContents?.stopFindInPage('clearSelection');
    });

    searchWin.webContents.on('dom-ready', () => {
        searchWin.webContents.send('theme-changed', currentTheme);
    });
}

function resizeSearchWindow() {
    if (!searchWin) return;

    const winBounds = mainWindow.getContentBounds();
    searchWin.setBounds({
        width: 320 * currentZoomFactor,
        height: 40 * currentZoomFactor,
        x: winBounds.x + winBounds.width - (320 * currentZoomFactor),
        y: winBounds.y + appHeaderHeight,
    });
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

function changeWindowBg(color) {
    if (mainWindow) {
        mainWindow.setBackgroundColor(color);
    }
}

function closeTab(id) {
    if (!mainWindow) return;
    const tabView = tabsMap.get(id);
    if (tabView) {
        mainWindow.contentView.removeChildView(tabView);
        tabView.webContents.destroy();
        tabsMap.delete(id);
    }
}

ipcMain.handle('quick-launcher-changed', async (event, detail) => {
    await quickLauncherChanged(detail);
});

ipcMain.handle('upload-files', async (event, acceptString) => {
    try {
        const webContents = event.sender;
        const win = BrowserWindow.fromWebContents(webContents);

        const customFilters = parseAcceptToFilters(acceptString);

        const result = await dialog.showOpenDialog(win, {
            title: 'Open',
            properties: ['openFile', 'multiSelections'],
            filters: customFilters
        });

        if (result.canceled || result.filePaths.length === 0) {
            return [];
        } else {
            const pdfBuffers = [];
            const tempFilesToClean = [];

            for (const filePath of result.filePaths) {
                const fileName = path.basename(filePath);
                const ext = path.extname(filePath).toLowerCase();
                const cleanExt = ext.replace(/^\./, '');

                const commonGlobalStyles = `
                    @page { size: A4; margin: 0; }
                    body { 
                        font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; 
                        margin: 0; padding: 50px; 
                        color: #1e293b; background-color: #ffffff; 
                        line-height: 1.6; font-size: 15px;
                    }
                    .file-banner { 
                        font-size: 12px; font-weight: 600; color: #64748b; 
                        padding-bottom: 12px; margin-bottom: 35px; 
                        border-bottom: 1px solid #e2e8f0;
                        letter-spacing: 1px; text-transform: uppercase;
                    }
                    pre { 
                        font-family: "Consolas", "Fira Code", "Courier New", monospace; 
                        font-size: 13px; line-height: 1.5; color: #0f172a;
                        white-space: pre-wrap; word-break: break-all; margin: 0; 
                    }
                `;

                if (ext === '.pdf') {
                    const pdfBytes = await fs.promises.readFile(filePath);
                    const pdfDoc = await PDFDocument.load(pdfBytes);
                    const pages = pdfDoc.getPages();

                    if (pages.length > 0) {
                        const firstPage = pages[0];
                        const width = firstPage.getWidth();
                        const height = firstPage.getHeight();

                        const headerHtml = `
                        <html>
                        <head>
                            <style>
                                @page { size: ${width}pt ${height}pt; margin: 0; }
                                body { 
                                    font-family: "Microsoft YaHei", -apple-system, sans-serif; 
                                    margin: 0; padding: 25px 40px;
                                    background-color: transparent;
                                }
                                .pdf-chinese-header { 
                                    font-size: 11px; font-weight: 600; color: #64748b; 
                                    padding-bottom: 6px;
                                    border-bottom: 1px solid #e2e8f0; 
                                    letter-spacing: 0.5px;
                                }
                            </style>
                        </head>
                        <body>
                            <div class="pdf-chinese-header">PDF SOURCE: ${fileName}</div>
                        </body>
                        </html>`;

                        const ghostWindow = new BrowserWindow({ show: false });
                        await ghostWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(headerHtml)}`);
                        const headerPdfData = await ghostWindow.webContents.printToPDF({
                            printBackground: false
                        });
                        ghostWindow.close();

                        const headerDoc = await PDFDocument.load(headerPdfData);

                        const [embeddedHeaderPage] = await pdfDoc.embedPages([headerDoc.getPages()[0]]);

                        firstPage.drawPage(embeddedHeaderPage, {
                            x: 0,
                            y: 0,
                            width: width,
                            height: height
                        });
                    }

                    const modifiedPdfBytes = await pdfDoc.save();
                    pdfBuffers.push(modifiedPdfBytes);
                }
                else if (CONVERTIBLE_TO_PDF_EXTS.includes(cleanExt)) {
                    let htmlContent = '';

                    if (WORD_DOC_EXTS.includes(cleanExt)) {
                        const docResult = await mammoth.convertToHtml({ path: filePath });
                        htmlContent = `
                        <html>
                        <head>
                            <style>
                                ${commonGlobalStyles}
                                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                                th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
                                th { background-color: #f8fafc; font-weight: 600; }
                            </style>
                        </head>
                        <body>
                            <div class="file-banner">DOCUMENT: ${fileName}</div>
                            <div class="word-content">${docResult.value}</div>
                        </body>
                        </html>`;
                    }
                    else if (EXCEL_DATA_SHEET_EXTS.includes(cleanExt)) {
                        const jsonArray = await csvtojson().fromFile(filePath);

                        if (jsonArray.length > 0) {
                            const headers = Object.keys(jsonArray[0]);
                            let tableRows = '';

                            tableRows += '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';

                            jsonArray.forEach(row => {
                                tableRows += '<tr>' + headers.map(h => `<td>${row[h] || ''}</td>`).join('') + '</tr>';
                            });

                            htmlContent = `
                            <html>
                            <head>
                                <style>
                                    ${commonGlobalStyles}
                                    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
                                    th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; color: #334155; }
                                    th { background-color: #f8fafc; color: #0f172a; font-weight: 600; }
                                    tr:nth-child(even) { background-color: #fdfdfd; } 
                                </style>
                            </head>
                            <body>
                                <div class="file-banner">DATA SHEET SOURCE: ${fileName}</div>
                                <table>${tableRows}</table>
                            </body>
                            </html>`;
                        }
                    }
                    else if (IMAGE_EXTS.includes(cleanExt)) {
                        const imageBuffer = await fs.promises.readFile(filePath);
                        const base64Data = imageBuffer.toString('base64');
                        const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${cleanExt}`;

                        htmlContent = `
                        <html>
                        <head>
                            <style>
                                ${commonGlobalStyles}
                                body { text-align: center; }
                                .img-container { 
                                    width: 100%; height: 75vh; 
                                    display: flex; justify-content: center; align-items: center; 
                                    margin-top: 20px; 
                                }
                                img { 
                                    max-width: 100%; max-height: 100%; object-fit: contain; 
                                    border: 1px solid #e2e8f0; padding: 6px; background: #ffffff;
                                }
                            </style>
                        </head>
                        <body>
                            <div class="file-banner">IMAGE SOURCE: ${fileName}</div>
                            <div class="img-container">
                                <img src="data:${mimeType};base64,${base64Data}" />
                            </div>
                        </body>
                        </html>`;
                    }
                    else if (PLAIN_TEXT_EXTS.includes(cleanExt)) {
                        const rawBuffer = await fs.promises.readFile(filePath, 'utf-8');
                        const rawText = rawBuffer.toString('utf8');
                        const sanitizedText = rawText.replace(/</g, '&lt;').replace(/>/g, '&gt;');

                        htmlContent = `
                        <html>
                        <head>
                            <style>${commonGlobalStyles}</style>
                        </head>
                        <body>
                            <div class="file-banner">TEXT SOURCE: ${fileName}</div>
                            <pre>${sanitizedText}</pre>
                        </body>
                        </html>`;
                    }

                    if (htmlContent) {
                        const pdfData = await generatePdfFromEmbeddedHtml(htmlContent);
                        pdfBuffers.push(pdfData);
                    }
                }
            }

            const mergedPdf = await PDFDocument.create();

            for (const pdfBuffer of pdfBuffers) {
                const srcDoc = await PDFDocument.load(pdfBuffer);
                const copiedPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
            }

            const finalPdfBytes = await mergedPdf.save();

            const finalPdfPath = path.join(app.getPath('temp'), `merged_files_${Date.now()}.pdf`);
            await fs.promises.writeFile(finalPdfPath, finalPdfBytes);

            return [finalPdfPath];
        }
    }
    catch (e) { }
});

ipcMain.handle('get-file-data', async (event, filePath) => {
    try {
        const stats = await fs.promises.stat(filePath);
        const buffer = await fs.promises.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();

        return {
            name: path.basename(filePath),
            size: stats.size,
            type: getExactMimeType(ext),
            bytes: new Uint8Array(buffer)
        };
    } catch (err) {
        return null;
    }
});

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
        } else {
            tabView.isVisible = false;
            tabView.setBounds({ x: 10000, y: 10000, width: 1, height: 1 });
            tabView.webContents.stopFindInPage('clearSelection');
        }
    }
});

ipcMain.handle('close-tab', (event, { id }) => {
    closeTab(id);
});

ipcMain.handle('get-current-theme', () => {
    return currentTheme;
});

ipcMain.handle('toggle-theme-from-ui', (theme) => {
    toggleApplicationTheme(theme);
});

ipcMain.handle('get-config', (event, key) => {
    return getConfig(key);
});

ipcMain.handle('is-google-search-ai-mode-real-chat-url', (event, url) => {
    return checkGoogleSearchAIModeRealChatURL(url, true);
});

ipcMain.handle('get-default-ai-supplier', (event, ignoreStartup) => {
    return getConfig('defaultAISupplier') && (getConfig('openNewTabOnStartup') || ignoreStartup) ? getDefaultAISupplier() : {
        id: 'about_blank', landingPage: 'about:blank', label: 'aboutBlank'
    };
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

    resizeViews();
});

ipcMain.handle('close-window', async () => {
    await quitApp();
});

ipcMain.handle('click-menu-item', (event, itemId) => {
    const targetMenuItem = menuItemsRegistry.get(itemId);

    if (!targetMenuItem) return;

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
    await exportHTMLContent(event.sender, htmlContent, type);
});

ipcMain.handle('menus-updated', () => {
    resizeViews();
    stopTrayAnimation();
});

ipcMain.handle('start-search', (event, text) => {
    const view = getActiveTabView();
    if (view) view.webContents.findInPage(text, { findNext: false });
});

ipcMain.handle('navigate-search', (event, text, forward) => {
    const view = getActiveTabView();
    if (view) view.webContents.findInPage(text, { findNext: true, forward: forward });
});

ipcMain.handle('stop-search', () => {
    for (const [tabId, tabView] of tabsMap.entries()) {
        tabView.webContents.stopFindInPage('clearSelection');
    }
});

ipcMain.handle('close-search-window', () => {
    if (searchWin) searchWin.close();
});

ipcMain.handle('zoom-app', (event, factor) => {
    zoomApp(factor);
});

ipcMain.handle('net-fetch-html', async (event, { src }) => {
    try {
        const sandboxFrame = getActiveTabView()?.webContents.mainFrame.frames.find(f => f.url === src);

        if (sandboxFrame) {
            const renderedHtml = await sandboxFrame.executeJavaScript(`document.documentElement.outerHTML`);
            return renderedHtml;
        }
    } catch (error) { }

    return null;
});

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
    createMainWindow();

    app.on('web-contents-created', (event, webContents) => {
        webContents.on('context-menu', (e, params) => {
            const clipboardText = clipboard.readText().trim();
            let validURL = false;
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