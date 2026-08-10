const { BrowserWindow, WebContentsView, screen } = require('electron');
const { aiRegistry, getSupplierByLandingPage, isAnySupplierReady } = require('../suppliers');

class QuickLauncherWindow {
    constructor({ getPreloadPath, getTrayManager, onOpenNewTab, onShowApp, getZoomFactor, onApplyTheme }) {
        this.getPreloadPath = getPreloadPath;
        this.onApplyTheme = onApplyTheme;
        this.window = null;
        this.view = null;
        this.hasGoogleSeachAIModeDomCheckURL = false;
        this.ignored1stGoogleSeachAIModeDomCheckURL = false;
        this.currentQuickLauncherProcessingURL = '';

        this.getTrayManager = getTrayManager;
        this.onOpenNewTab = onOpenNewTab;
        this.onShowApp = onShowApp;
        this.getZoomFactor = getZoomFactor;
    }

    getView() {
        return this.view;
    }

    open(landingPage) {
        const trayManager = this.getTrayManager();
        trayManager.isPopUpContextMenu = false;
        trayManager.startAnimation();

        if (this.window) {
            this.window.hide();
            this.view.webContents.loadURL(landingPage);
            return;
        }

        this.window = new BrowserWindow({
            width: 0,
            height: 0,
            frame: false,
            resizable: true,
            alwaysOnTop: false,
            show: false
        });

        this.view = new WebContentsView({
            webPreferences: {
                preload: this.getPreloadPath(landingPage),
                contextIsolation: true,
                nodeIntegration: false,
                transparent: true
            }
        });

        this.window.contentView.addChildView(this.view);
        this.view.webContents.loadURL(landingPage);

        this.window.on('will-resize', (event, newBounds) => {
            this.window.removeAllListeners('resize');

            this.window.once('resize', async () => {
                const [currentWidth, currentHeight] = this.window.getSize();
                this.view.setBounds({
                    x: 0,
                    y: 0,
                    width: currentWidth,
                    height: currentHeight
                });

                await this.view.webContents.executeJavaScript(`
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

        this.window.on('closed', () => {
            this.window = null;
            this.view = null;
        });

        this.view.webContents.on('did-finish-load', async () => {
            await this.onApplyTheme?.(this.view);

            await this.view.webContents.executeJavaScript(`
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
                await this.changed();
                setTimeout(async () => { await this.changed(); }, 150);
                this.getTrayManager().stopAnimation();
                this.show();
            }, 150 * 2);

            this.view.webContents.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
                if (aiRegistry && Array.from(aiRegistry.values()).some(s => s.checkRealChatURL(url))) {
                    this.getTrayManager().startAnimation();
                    this.window.hide();
                    setTimeout(async () => { await this.changed(url); }, 150);
                }
            });
        });
    }

    show() {
        this.window.show();
        this.window.focus();
        this.view.webContents.focus();
    }

    async loadURLWithDomCheck(webContents, url, maxRetries = 6) {
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        this.getTrayManager().startAnimation();

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            if (webContents.isDestroyed()) return false;

            webContents.removeAllListeners('did-finish-load');

            const pageLoadPromise = new Promise((resolve) => {
                webContents.once('did-finish-load', () => resolve());
            });

            webContents.loadURL(url);

            await pageLoadPromise;

            await sleep(1500);

            try {
                if (webContents.getURL() !== url) return true;
                if (await isAnySupplierReady(webContents)) {
                    this.getTrayManager().stopAnimation();
                    return true;
                }
            } catch (err) { }

            if (attempt < maxRetries) {
                await sleep(1500);
            }
        }

        return false;
    }

    async changed(detail) {
        if (!this.window || !this.view || this.window.isDestroyed()) return;

        if (detail) {
            if (detail === 'Escape') {
                this.window.close();
            } else {
                if (this.currentQuickLauncherProcessingURL === detail) return;

                this.currentQuickLauncherProcessingURL = detail;
                if (this.hasGoogleSeachAIModeDomCheckURL) return;
                this.hasGoogleSeachAIModeDomCheckURL = aiRegistry.get('google_search_ai_mode').checkRealChatURL(detail);

                if (this.hasGoogleSeachAIModeDomCheckURL && !this.ignored1stGoogleSeachAIModeDomCheckURL) {
                    this.ignored1stGoogleSeachAIModeDomCheckURL = true;
                    this.hasGoogleSeachAIModeDomCheckURL = false;
                    return;
                }

                const activeWebContents = this.onOpenNewTab(detail).webContents;

                if (activeWebContents) {
                    const success = await this.loadURLWithDomCheck(activeWebContents, detail, 6);

                    this.currentQuickLauncherProcessingURL = '';
                    this.hasGoogleSeachAIModeDomCheckURL = false;
                    this.ignored1stGoogleSeachAIModeDomCheckURL = false;

                    if (success) {
                        this.window?.close();
                        this.onShowApp();
                    } else {
                        this.window?.show();
                    }
                }
            }

            return;
        }

        const currentURL = this.view.webContents.getURL();
        const supplier = getSupplierByLandingPage(currentURL);
        if (!supplier) return;

        const jsCode = supplier.getQuickLauncherJS();
        if (!jsCode) return;

        let rect = await this.view.webContents.executeJavaScript(jsCode);

        if (!rect) {
            rect = { top: 16, left: 16, width: 1200 - 32, height: 600 - 32 };
        }
        if (rect.top <= 0) rect.top = rect.left;
        if (rect.width <= 0) rect.width = rect.height;

        this.view?.setBounds({
            x: (-rect.left + 16) * this.getZoomFactor(),
            y: (-rect.top + 16) * this.getZoomFactor(),
            width: 1200,
            height: 800
        });

        this.resize(this.window, (rect.width + 32) * this.getZoomFactor(), (rect.height + 32) * this.getZoomFactor());
    }

    resize(window, targetWidth, targetHeight) {
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
}

module.exports = QuickLauncherWindow;
