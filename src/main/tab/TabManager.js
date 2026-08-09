const { WebContentsView } = require('electron');
const { getConfig } = require('../config');
const { SIDE_PADDING, APP_USER_AGENT } = require('../constants');
const { getAllSuppliers } = require('../suppliers');
const { buildTabPreload } = require('../preloadBuilder');

class TabManager {
    constructor({ windowManager, searchWindow, onInjectLocalStorage, onToggleApplicationTheme }) {
        this.windowManager = windowManager;
        this.searchWindow = searchWindow;
        this.onInjectLocalStorage = onInjectLocalStorage;
        this.onToggleApplicationTheme = onToggleApplicationTheme;
        this.tabsMap = new Map();
    }

    getActiveTabView() {
        return Array.from(this.tabsMap.values()).find(tab => tab.isVisible);
    }

    createNewTabBackend(url) {
        const tabId = 'tab_' + Date.now();
        return this.createNewTabInstance(tabId, url, true);
    }

    createNewTabInstance(id, url, sendMsg = false) {
        if (!this.windowManager.mainWindow) return;

        const blankTabId = Array.from(this.tabsMap.entries()).find(([id, tab]) => tab.webContents.getURL() === 'about:blank')?.[0];
        if (blankTabId) {
            this.closeTab(blankTabId);
            this.windowManager.titleBarView?.webContents.send('old-tab-closed', blankTabId);
        }

        const tabView = new WebContentsView({
            webPreferences: {
                preload: buildTabPreload(url),
                contextIsolation: true,
                nodeIntegration: false,
                transparent: true
            }
        });

        tabView.isVisible = false;
        this.windowManager.mainWindow.contentView.addChildView(tabView);
        this.tabsMap.set(id, tabView);

        tabView.webContents.loadURL(url, {
            userAgent: APP_USER_AGENT
        });

        tabView.webContents.on('page-title-updated', async (e, title) => {
            if (title && title.trim() !== "") {
                this.windowManager.titleBarView?.webContents.send('title-changed', { id, title: title.trim() });
            }
        });

        tabView.webContents.setWindowOpenHandler(({ url }) => {
            this.createNewTabBackend(url);
            return { action: 'deny' };
        });

        tabView.webContents.on('dom-ready', () => {
            this.onInjectLocalStorage(tabView, getAllSuppliers().flatMap(s => s.getThemeBridgeKeys()));
        });

        if (sendMsg) {
            this.windowManager.titleBarView?.webContents.send('new-tab-created', { id, url });
        }

        this.windowManager.currentZoomFactor = this.windowManager.titleBarView.webContents.getZoomFactor();

        tabView.webContents.on('found-in-page', (event, result) => {
            if (this.searchWindow.isVisible() && result.activeMatchOrdinal !== undefined) {
                this.searchWindow.send('search-result-data', {
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
                        this.searchWindow.create(tabView);
                    } else if (key === 'r') {
                        event.preventDefault();
                        this.reloadTabView(tabView.webContents);
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
                    this.reloadTabView(this.getActiveTabView()?.webContents);
                } else if (key === 'f12') {
                    event.preventDefault();
                    this.getActiveTabView()?.webContents.openDevTools({ mode: 'detach' });
                }
            }
        });

        this.onToggleApplicationTheme(getConfig('theme') ?? 'system');

        return tabView;
    }

    reloadTabView(webContents) {
        webContents?.reload();
    }

    restoreTabViewSize(activeTabView, bounds = null) {
        if (!bounds) bounds = this.windowManager.mainWindow.getContentBounds();

        if (activeTabView && activeTabView.isVisible) {
            activeTabView.setBounds({
                x: SIDE_PADDING,
                y: this.windowManager.appHeaderHeight,
                width: bounds.width - (SIDE_PADDING * 2),
                height: bounds.height - this.windowManager.appHeaderHeight - SIDE_PADDING
            });

            setTimeout(() => {
                activeTabView.webContents?.focus();
            }, 150);
        }
    }

    closeTab(id) {
        if (!this.windowManager.mainWindow) return;
        const tabView = this.tabsMap.get(id);
        if (tabView) {
            this.windowManager.mainWindow.contentView.removeChildView(tabView);
            tabView.webContents.destroy();
            this.tabsMap.delete(id);
        }
    }

    switchTab(id) {
        if (!this.windowManager.mainWindow) return;
        const bounds = this.windowManager.mainWindow.getContentBounds();

        for (const [tabId, tabView] of this.tabsMap.entries()) {
            if (tabId === id) {
                tabView.isVisible = true;
                this.restoreTabViewSize(tabView, bounds);
                tabView.webContents.focus();
            } else {
                tabView.isVisible = false;
                tabView.setBounds({ x: 10000, y: 10000, width: 1, height: 1 });
                tabView.webContents.stopFindInPage('clearSelection');
            }
        }
    }
}

module.exports = TabManager;
