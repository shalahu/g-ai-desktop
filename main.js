const { app, BaseWindow, WebContentsView, ipcMain, nativeTheme, Tray, Menu, globalShortcut, nativeImage, BrowserWindow, dialog, net, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const type = require('os');
const { PDFDocument } = require('pdf-lib');
const mammoth = require('mammoth');
const csvtojson = require('csvtojson');
const console = require('console');

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
const APP_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) G-AIDesktop/0.10.0 Chrome/150.0.0.0 Electron/31.7.7 Safari/537.36";
const WORD_DOC_EXTS = ['doc', 'docx'];
const EXCEL_DATA_SHEET_EXTS = ['csv']
const PLAIN_TEXT_EXTS = ['html', 'htm', 'txt', 'md', 'rtf', 'java', 'py', 'cpp', 'js', 'css', 'cs', 'json', 'ts', 'tsx', 'jsx', 'go', 'rs', 'sh', 'bat', 'yaml', 'yml', 'xml', 'ini', 'toml', 'sql', 'kt', 'swift', 'php', 'tsv', 'log', 'vcf', 'ps1'];
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'heic', 'heif'];
const CONVERTIBLE_TO_PDF_EXTS = [...WORD_DOC_EXTS, ...EXCEL_DATA_SHEET_EXTS, ...PLAIN_TEXT_EXTS, ...IMAGE_EXTS];

const tabsMap = new Map();
const menuItemsRegistry = new Map();
const configPath = path.join(app.getPath('userData'), 'user-config.json');
const constants = Object.freeze({
    AI_SUPPLIERS: Object.freeze({
        G_GEMINI: { id: 'google_gemini', landingPage: 'https://gemini.google.com/app', title: 'Google Gemini', label: 'Google Gemini' },
        G_SEACH_AI_MODE: {
            id: 'google_search_ai_node', landingPage: 'https://www.google.com/search?udm=50', title: 'Google Search', label: 'Google Search (AI Mode)'
        },
    }),
});

let appHeaderHeight = DEFAULT_APP_HEADER_HEIGHT;
let baseAppHeaderHeight = DEFAULT_APP_HEADER_HEIGHT;
let barMenusTemplate = [];
let mainWindow;
let titleBarView;
let tray = null;
let currentTheme = 'dark';
let lastClickTime = 0;
let currentZoomFactor = DEFAULT_ZOOM_FACTOR;
let addTabItems = [];

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

function updateMenus(updateTrayMenus = false, updateAppMenus = true) {
    if (updateTrayMenus) {
        tray.setContextMenu(createContextMenu(true));
    }
    if (updateAppMenus) {
        Menu.setApplicationMenu(createContextMenu(false));
    }
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

function showAppAndAddNewTab(url) {
    createNewTabBackend(url ?? getDefaultAISupplier().landingPage);

    showApp();
}

function createNewTabBackend(url) {
    const tabId = 'tab_' + Date.now();
    createNewTabInstance(tabId, url, true);
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

    const iconPath = path.join(__dirname, 'assets/icon.png');

    mainWindow = new BaseWindow({
        width: 1200,
        height: 800,
        title: APP_NAME,
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

    // setTimeout(() => {
    //     resizeViews();
    // }, 50);

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

    tray.setToolTip(APP_NAME);
    tray.setContextMenu(createContextMenu(true));
    tray.on('click',
        () => {
            if (getConfig('iconDefaults') === null || getConfig('iconDefaults') === 'showHideWindow') {
                handleTrayClick();
            }
            else if (getConfig('iconDefaults') === 'openNewTab') {
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

    if (!IS_LINUX) {
        mainWindow.on('enter-full-screen', () => {
            autoHideMenuBar();
        });

        mainWindow.on('leave-full-screen', () => {
            autoHideMenuBar();
        });
    }

    // setTimeout(() => { toggleApplicationTheme(getConfig('theme') ?? 'system'); }, 250);

    // toggleApplicationTheme(getConfig('theme') ?? 'system');

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

    appHeaderHeight = Math.round(baseAppHeaderHeight * currentZoomFactor);
    updateMenus();
}

async function triggerExport(type) {
    const activeTabView = getActiveTabView();

    if (isGeminiRealChatURL(activeTabView)) {
        const isGeminiRealChatReady = await activeTabView.webContents.executeJavaScript(`
                !!(document.querySelector('.conversation-container') && document.querySelector('conversation-actions-icon') && document.querySelector('[trace="ChatContainer"]'))
                `);
        if (isGeminiRealChatReady) {
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
                } catch (e) {}
            })();
            `;

            activeTabView.webContents.executeJavaScript(jsCode);
        }
    } else if (isGoogleSearchAIModeRealChatURL(activeTabView)) {
        const isGoogleSearchAIModeRealChatReady = await activeTabView.webContents.executeJavaScript(`
                !!(document.querySelector('div[data-xid="aim-mars-turn-root"]') && document.querySelector('div[data-scope-id="turn"]') && document.querySelector('div[data-container-id="main-col"]'))
                `);

        if (isGoogleSearchAIModeRealChatReady) {
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
                const responseHTML = responses.map(res => res.innerHTML ? res.innerHTML.trim() : "").filter(t => t !== "").join('\\n');
  
                if (promptText || responseText) { 
                    turns.push({ prompt: promptText, responseText: responseText, responseHTML: responseHTML }); 
                } 
            }); 
            
            const chatData = { title: document.title || "AI CHAT LOG", url: document.location.href, dialogues: turns }; 
            
            return chatData;
            } catch (e) {console.error(e);} })();`;

            const chatData = await activeTabView.webContents.executeJavaScript(jsCode);

            let dialoguesHtml = "";
            chatData.dialogues.forEach((round, index) => {
                dialoguesHtml += '<div class="chat-section prompt-section">' +
                    '<div class="section-label">User Prompt #' + (index + 1) + '</div>' +
                    '<div class="content">' + round.prompt + '</div>' +
                    '</div>' +
                    '<div class="chat-section response-section">' +
                    '<div class="section-label">AI Response #' + (index + 1) + '</div>' +
                    '<div class="content">' + round.responseText;
                if (round.responseHTML) {
                    // dialoguesHtml += '<div class="code-block-wrapper"><pre>' + round.responseHTML + '</pre></div>'; 
                }
                dialoguesHtml += '</div></div>';
            });

            const htmlContent = '<!DOCTYPE html><html lang="und"><head><meta charset="UTF-8"><title>' + chatData.title + '</title>' +
                '<style>@page { size: A4; margin: 0; } body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; margin: 0; padding: 50px; color: #1e293b; background-color: #ffffff; line-height: 1.6; font-size: 15px;} .file-banner { font-size: 12px; font-weight: 600; color: #64748b; padding-bottom: 12px; margin-bottom: 35px; border-bottom: 1px solid #e2e8f0; letter-spacing: 1px; text-transform: uppercase;} pre { font-family: "Consolas", "Fira Code", "Courier New", monospace; font-size: 13px; line-height: 1.5; color: #0f172a; white-space: pre-wrap; word-break: break-all; margin: 0; } a .export-title { font-size: 24px; font-weight: 700; color: #0f172a; margin-bottom: 30px; } .chat-section { margin-bottom: 25px; border-radius: 8px; padding: 20px; } .prompt-section { background-color: #f8fafc; border-left: 4px solid #64748b; } .response-section { background-color: #ffffff; border-left: 4px solid #3b82f6; border: 1px solid #f1f5f9; } .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; } .prompt-section .section-label { color: #64748b; } .response-section .section-label { color: #3b82f6; } .content { color: #334155; font-size: 15px; white-space: pre-wrap; } .code-block-wrapper { margin: 8px; padding: 16px; display: inline-flex; align-items: center; vertical-align: middle; background-color: #f1f5f9; border-radius: 4px; border: 1px solid #e2e8f0; } .code-block-wrapper pre { display: inline; font-size: 0.9em; font-family: "Consolas", "Fira Code", "Courier New", monospace; color: #0f172a; white-space: pre; word-break: normal; margin: 0; white-space: pre-wrap; word-wrap: break-word; word-break: break-all; } table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; } th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; color: #334155; } th { background-color: #f8fafc; color: #0f172a; font-weight: 600; } tr:nth-child(even) { background-color: #fdfdfd; } </style></head>' +
                '<body><div class="file-banner">AI CHAT LOG</div><a href="' + chatData.url + '"><h1 class="export-title">' + chatData.title + '</h1></a>' + dialoguesHtml + '</body></html>';

            await exportHTMLContent(activeTabView.webContents, htmlContent, type);
        }
    }
    else {
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

    let newTabItme = null;
    addTabItems = [];

    if (isDefaultAISupplierSet()) {
        const defaultAISupplier = getDefaultAISupplier();
        newTabItme = {
            id: 'm-newtab',
            label: 'New Tab - ' + defaultAISupplier.label,
            click: () => {
                showAppAndAddNewTab();
            }
        };
    } else {
        entries.map(([key, value]) => {
            addTabItems.push({
                id: 'm-newtab-' + value.id,
                label: value.label,
                click: () => {
                    showAppAndAddNewTab(value.landingPage);
                }
            })
        });


        newTabItme = {
            id: 'm-newtab',
            label: 'New Tab',
            submenu: addTabItems
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
        menuTemplate.push(newTabItme);
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
                },
                {
                    id: "m-exprot-doc",
                    label: 'Doc',
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
        visible: !IS_LINUX,
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
            checked: !isDefaultAISupplierSet(),
            click: (menuItem) => {
                saveConfig('defaultAISupplier', '');
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
        updateMenus();
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

function isGeminiRealChatURL(tabView) {
    const currentURL = tabView.webContents.getURL();
    const geminiChatRegex = /gemini\.google\.com\/app\/[0-9a-fA-F]{16}/;

    return geminiChatRegex.test(currentURL);
}

function isGoogleSearchAIModeRealChatURL(tabView) {
    const currentURL = tabView.webContents.getURL();
    const targetUrl = new URL(constants.AI_SUPPLIERS.G_SEACH_AI_MODE.landingPage);
    const currentUrlObj = new URL(currentURL);

    const isBaseMatch = currentUrlObj.origin === targetUrl.origin &&
        currentUrlObj.pathname === targetUrl.pathname;

    const targetParams = targetUrl.searchParams;
    const currentParams = currentUrlObj.searchParams;

    const isQueryMatch = Array.from(targetParams.keys()).every(key =>
        currentParams.has(key) && currentParams.get(key) === targetParams.get(key)
    );

    return isBaseMatch && isQueryMatch;
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

    // tabView.webContents.on('did-navigate-in-page', (event, url) => {
    // });

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

    // const zoomFactor = titleBarView.webContents.getZoomFactor();
    // if (currentZoomFactor !== zoomFactor) {
    //     currentZoomFactor = zoomFactor;
    //     updateMenus();
    // }

    toggleApplicationTheme(getConfig('theme') ?? 'system');
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
                console.error(err);
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
    let safeName = userInputName.replace(/[^a-zA-Z0-9.\-_]/g, '_');

    safeName = safeName.replace(/^\.+/, '');

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
            case 'doc':
                content = await convertHtmlImagesToBase64(htmlContent, sender);
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
            await fs.promises.writeFile(filePath, content, 'utf-8');
            const notice = new Notification({
                title: 'Export Success',
                body: 'Your file is ready.',
                silent: false,
                icon: 'assets/icon.png'
            })

            notice.show()
        }

    } catch (err) { }
}

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
    catch (e) {
        console.error(e);
    }
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

// ipcMain.handle('get-constants', () => {
//     return constants;
// });

ipcMain.handle('is-google-search-ai-mode-real-chat-url', () => {
    return isGoogleSearchAIModeRealChatURL(getActiveTabView());
});

ipcMain.handle('get-default-ai-supplier', () => {
    return getDefaultAISupplier();
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
});