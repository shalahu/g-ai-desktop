const { BaseWindow, WebContentsView, globalShortcut, nativeTheme, Menu } = require('electron');
const { getConfig } = require('../config');
const {
    APP_NAME,
    ICON_PATH,
    DEFAULT_MAIN_WINDOW_FRAME,
    DEFAULT_APP_HEADER_HEIGHT,
    DEFAULT_ZOOM_FACTOR,
    MIN_ZOOM_FACTOR,
    MAX_ZOOM_FACTOR,
    IS_LINUX
} = require('../constants');
const { getDefaultSupplier, getNextLandingPage } = require('../suppliers');

class WindowManager {
    constructor({
        preloadPath,
        htmlPath,
        getContextMenu,
        onQuitApp,
        getTrayManager,
        onShowAppAndAddNewTab,
        getActiveTabView,
        onRestoreTabViewSize,
        getSearchWindow,
        getQuickLauncherView,
        onQuickLauncherChanged,
        onUpdateMenus,
        setCurrentTheme
    }) {
        this.preloadPath = preloadPath;
        this.htmlPath = htmlPath;
        this.mainWindow = null;
        this.titleBarView = null;
        this.appHeaderHeight = DEFAULT_APP_HEADER_HEIGHT;
        this.baseAppHeaderHeight = DEFAULT_APP_HEADER_HEIGHT;
        this.currentZoomFactor = DEFAULT_ZOOM_FACTOR;

        this.getContextMenu = getContextMenu;
        this.onQuitApp = onQuitApp;
        this.getTrayManager = getTrayManager;
        this.onShowAppAndAddNewTab = onShowAppAndAddNewTab;
        this.getActiveTabView = getActiveTabView;
        this.onRestoreTabViewSize = onRestoreTabViewSize;
        this.getSearchWindow = getSearchWindow;
        this.getQuickLauncherView = getQuickLauncherView;
        this.onQuickLauncherChanged = onQuickLauncherChanged;
        this.onUpdateMenus = onUpdateMenus;
        this.setCurrentTheme = setCurrentTheme;
    }

    createMainWindow() {
        Menu.setApplicationMenu(this.getContextMenu(false));

        this.mainWindow = new BaseWindow({
            width: 1200,
            height: 800,
            title: APP_NAME,
            icon: ICON_PATH,
            frame: DEFAULT_MAIN_WINDOW_FRAME,
            show: !getConfig('minimizeToTrayOnStartup'),
            autoHideMenuBar: false
        });

        this.titleBarView = new WebContentsView({
            webPreferences: {
                preload: this.preloadPath,
                contextIsolation: true,
                nodeIntegration: false
            }
        });

        this.mainWindow.contentView.addChildView(this.titleBarView);
        this.titleBarView.webContents.loadFile(this.htmlPath);

        this.setCurrentTheme(getConfig('theme') === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : getConfig('theme'));

        this.mainWindow.on('resize', () => this.resizeViews());

        this.mainWindow.on('close', async (e) => {
            e.preventDefault();

            await this.onQuitApp();
        });

        this.mainWindow.on('restore', () => {
            this.resizeViews();
        });

        globalShortcut.register('CmdOrCtrl+Shift+Space', () => {
            this.getTrayManager().handleTrayClick();
        });

        globalShortcut.register('CmdOrCtrl+Shift+Alt+Space', () => {
            this.getTrayManager().isPopUpContextMenu = true;
            this.onShowAppAndAddNewTab(getConfig('defaultAISupplier') ? getDefaultSupplier().landingPage : getNextLandingPage(this.getQuickLauncherView()?.webContents.getURL()));
        })

        this.getTrayManager().createTray();

        this.getTrayManager().startAnimation();

        if (!IS_LINUX) {
            this.mainWindow.on('enter-full-screen', () => {
                this.autoHideMenuBar();
            });

            this.mainWindow.on('leave-full-screen', () => {
                this.autoHideMenuBar();
            });
        }

        this.autoHideMenuBar();

        this.titleBarView.webContents.on('context-menu', (e, params) => {
            const defaultMenuTemplate = [
                { label: 'Inspect', click: () => this.titleBarView.webContents.inspectElement(params.x, params.y) }
            ];

            const menu = Menu.buildFromTemplate(defaultMenuTemplate);
            menu.popup();
        });
    }

    resizeViews() {
        if (!this.mainWindow.isDestroyed() && this.titleBarView && !this.titleBarView.webContents.isDestroyed()) {
            const bounds = this.mainWindow.getContentBounds();

            this.titleBarView.setBounds({ x: 0, y: 0, width: bounds.width, height: this.appHeaderHeight });

            this.onRestoreTabViewSize(this.getActiveTabView(), bounds);
        }
    }

    showApp() {
        this.mainWindow.show();
        this.mainWindow.focus();
        this.getActiveTabView()?.webContents.focus();
    }

    autoHideMenuBar() {
        const autoHideMenuBar = (getConfig('autoHideTitleBar') ?? false);
        this.mainWindow.setMenuBarVisibility(!autoHideMenuBar);
        this.mainWindow.setAutoHideMenuBar(autoHideMenuBar);
    }

    toggleFullscreen() {
        const isFull = this.mainWindow.isFullScreen();

        this.mainWindow.setFullScreen(!isFull);

        if (IS_LINUX) {
            this.resizeViews();
        }
    }

    zoomApp(factor) {
        this.currentZoomFactor = this.titleBarView?.webContents.getZoomFactor();

        if (factor > 0) {
            this.currentZoomFactor = Math.min(parseFloat((this.currentZoomFactor + factor).toFixed(1)), MAX_ZOOM_FACTOR);
        }
        else if (factor === 0) {
            this.currentZoomFactor = DEFAULT_ZOOM_FACTOR;
        }
        else {
            this.currentZoomFactor = Math.max(parseFloat((this.currentZoomFactor + factor).toFixed(1)), MIN_ZOOM_FACTOR);
        }

        this.titleBarView?.webContents.setZoomFactor(this.currentZoomFactor);
        this.getActiveTabView()?.webContents.setZoomFactor(this.currentZoomFactor);
        this.getSearchWindow().setZoomFactor(this.currentZoomFactor);
        this.getQuickLauncherView()?.webContents.setZoomFactor(this.currentZoomFactor);
        setTimeout(() => { this.getSearchWindow().resize(); this.onQuickLauncherChanged(); }, 150);

        this.appHeaderHeight = Math.round(this.baseAppHeaderHeight * this.currentZoomFactor);
        this.onUpdateMenus();
    }

    changeWindowBg(color) {
        if (this.mainWindow) {
            this.mainWindow.setBackgroundColor(color);
        }
    }
}

module.exports = WindowManager;
