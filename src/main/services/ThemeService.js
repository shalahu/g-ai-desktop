const { nativeTheme } = require('electron');
const { getConfig, saveConfig } = require('../config');
const { getAllSuppliers } = require('../suppliers');

class ThemeService {
    constructor({ windowManager, searchWindow, quickLauncherWindowManager, tabManager, menuManager }) {
        this.windowManager = windowManager;
        this.searchWindow = searchWindow;
        this.quickLauncherWindowManager = quickLauncherWindowManager;
        this.tabManager = tabManager;
        this.menuManager = menuManager;
        this.currentTheme = 'dark';
    }

    async handleThemeBridge(key, value) {
        for (const supplier of getAllSuppliers()) {
            const rendererAction = await supplier.handleThemeBridge({
                key,
                value,
                toggleTheme: (theme) => this.toggleApplicationTheme(theme ?? 'system', true)
            });

            if (rendererAction !== undefined) {
                return rendererAction;
            }
        }

        return null;
    }

    async toggleApplicationTheme(theme, fromWeb = false) {
        if (theme === null || theme === undefined) {
            theme = 'system';
        }

        if (getConfig('theme') === theme && fromWeb) {
            return;
        }

        const targetTheme = theme === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : theme;
        this.currentTheme = targetTheme;

        if (this.currentTheme === 'dark') {
            this.windowManager.changeWindowBg('#131314');
        } else {
            this.windowManager.changeWindowBg('#f0f4f9');
        }

        this.windowManager.titleBarView?.webContents.send('theme-changed', this.currentTheme);
        this.searchWindow.send('theme-changed', this.currentTheme);
        await this.changeViewTheme(this.quickLauncherWindowManager.view, theme);

        for (const [id, tabView] of this.tabManager.tabsMap.entries()) {
            if (!fromWeb || !tabView.isVisible) {
                await this.changeViewTheme(tabView, theme);
            }
        }

        saveConfig('theme', theme);

        this.menuManager.updateMenus();
    }

    async changeViewTheme(tabView, theme) {
        if (!tabView) return;

        const deps = {
            theme,
            currentTheme: this.currentTheme,
            setLocalStorage: (tv, key, value) => this.setLocalStorage(tv, key, value),
            removeLocalStorage: (tv, key) => this.removeLocalStorage(tv, key)
        };

        try {
            for (const supplier of getAllSuppliers()) {
                if (await supplier.applyViewTheme({ tabView, ...deps })) return;
            }
        } catch (err) {}
    }

    removeLocalStorage(tabView, key) {
        const jsCode = `
        (() => {
            try {
                window.__APP_LOCALSTORAGE_WRITE__ = true;
                localStorage.removeItem("${key}");
                window.__APP_LOCALSTORAGE_WRITE__ = false;

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

    setLocalStorage(tabView, key, value) {
        const jsInjectCode = `
        (() => {
            try {
                window.__APP_LOCALSTORAGE_WRITE__ = true;
                localStorage.setItem("${key}", "${value}");
                window.__APP_LOCALSTORAGE_WRITE__ = false;

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

    async getLocalStorage(tabView, key) {
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

    injectLocalStorage(tabView, keys) {
        const injectLocalStorageSpyJS = `
        (() => {
            if (window.__LOCALSTORAGE_SPY_ACTIVE__) return;
            window.__LOCALSTORAGE_SPY_ACTIVE__ = true;

            const originalSet = Storage.prototype.setItem;
            const originalRemove = Storage.prototype.removeItem;
            const keys = ${JSON.stringify(keys)};

            Storage.prototype.setItem = function (key, value) {
                originalSet.apply(this, arguments);

                if (!window.__APP_LOCALSTORAGE_WRITE__ && keys.includes(key)) {
                    try {
                         window.dispatchEvent(new CustomEvent('local-storage-set-bridge', { detail: {key, value} }));
                    } catch(e) {}
                }
            };

            Storage.prototype.removeItem = function (key) {
                originalRemove.apply(this, arguments);

                if (!window.__APP_LOCALSTORAGE_WRITE__ && keys.includes(key)) {
                    try {
                        window.dispatchEvent(new CustomEvent('local-storage-remove-bridge'));
                    } catch(e) {}
                }
            };
        })();
    `;

        tabView.webContents.executeJavaScript(injectLocalStorageSpyJS).catch((e) => { });
    }
}

module.exports = ThemeService;
