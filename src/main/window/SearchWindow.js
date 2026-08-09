const { BrowserWindow } = require('electron');

class SearchWindow {
    constructor({ preloadPath, htmlPath, getMainWindow, getCurrentTheme, getZoomFactor, getAppHeaderHeight }) {
        this.preloadPath = preloadPath;
        this.htmlPath = htmlPath;
        this.win = null;
        this.getMainWindow = getMainWindow;
        this.getCurrentTheme = getCurrentTheme;
        this.getZoomFactor = getZoomFactor;
        this.getAppHeaderHeight = getAppHeaderHeight;
    }

    create(tabView) {
        if (this.win) {
            this.win.focus();
            return;
        }

        const mainWindow = this.getMainWindow();
        const winBounds = mainWindow.getContentBounds();
        const zoomFactor = this.getZoomFactor();

        this.win = new BrowserWindow({
            width: 320 * zoomFactor,
            height: 40 * zoomFactor,
            x: winBounds.x + winBounds.width - (320 * zoomFactor),
            y: winBounds.y + this.getAppHeaderHeight(),
            parent: mainWindow,
            frame: false,
            resizable: false,
            transparent: true,
            alwaysOnTop: true,
            webPreferences: {
                preload: this.preloadPath
            }
        });

        this.win.loadFile(this.htmlPath);

        this.win.on('closed', () => {
            this.win = null;
            if (tabView) tabView.webContents?.stopFindInPage('clearSelection');
        });

        this.win.webContents.on('dom-ready', () => {
            this.win.webContents.send('theme-changed', this.getCurrentTheme());
        });
    }

    resize() {
        if (!this.win) return;

        const mainWindow = this.getMainWindow();
        const winBounds = mainWindow.getContentBounds();
        const zoomFactor = this.getZoomFactor();

        this.win.setBounds({
            width: 320 * zoomFactor,
            height: 40 * zoomFactor,
            x: winBounds.x + winBounds.width - (320 * zoomFactor),
            y: winBounds.y + this.getAppHeaderHeight(),
        });
    }

    isVisible() {
        if (!this.win || this.win.isDestroyed()) return false;
        return this.win.isVisible();
    }

    hide() {
        if (this.win && !this.win.isDestroyed()) this.win.hide();
    }

    show() {
        if (this.win && !this.win.isDestroyed()) this.win.show();
    }

    focus() {
        if (this.win && !this.win.isDestroyed()) this.win.focus();
    }

    close() {
        if (this.win && !this.win.isDestroyed()) this.win.close();
    }

    send(channel, ...args) {
        if (this.win && !this.win.isDestroyed()) {
            this.win.webContents.send(channel, ...args);
        }
    }

    setZoomFactor(factor) {
        if (this.win && !this.win.isDestroyed()) {
            this.win.webContents.setZoomFactor(factor);
        }
    }
}

module.exports = SearchWindow;
