const path = require('path');
const { Tray, Menu, nativeImage } = require('electron');
const { getConfig } = require('../config');
const { APP_NAME } = require('../constants');
const { isDefaultSupplierSet } = require('../suppliers');

class TrayManager {
    constructor({ iconPath, getContextMenu, getAddTabItems, onShowApp, onShowAppAndAddNewTab, onUpdateMenus, getMainWindow, getSearchWindow }) {
        this.iconPath = iconPath;
        this.tray = null;
        this.lastClickTime = 0;
        this.animationTimer = null;
        this.currentStep = 0;
        this.baseImage = null;
        this.cachedFrames = [];
        this.isPopUpContextMenu = false;

        this.getContextMenu = getContextMenu;
        this.getAddTabItems = getAddTabItems;
        this.onShowApp = onShowApp;
        this.onShowAppAndAddNewTab = onShowAppAndAddNewTab;
        this.onUpdateMenus = onUpdateMenus;
        this.getMainWindow = getMainWindow;
        this.getSearchWindow = getSearchWindow;
    }

    createTray() {
        this.tray = new Tray(this.iconPath);

        this.tray.setToolTip(APP_NAME);
        this.tray.setContextMenu(this.getContextMenu(true));
        this.tray.on('click',
            () => {
                this.isPopUpContextMenu = true;
                const iconDefaults = getConfig('iconDefaults');
                if (iconDefaults === null || iconDefaults === 'showHideWindow') {
                    this.handleTrayClick();
                }
                else if (iconDefaults === 'openNewTab' || iconDefaults === 'openQuickLauncher') {
                    if (isDefaultSupplierSet()) {
                        this.onShowAppAndAddNewTab();
                    } else {
                        const addTabMenu = Menu.buildFromTemplate(this.getAddTabItems());
                        addTabMenu.on('menu-will-close', () => {
                            this.onUpdateMenus(true, false);
                        });
                        this.tray.setContextMenu(addTabMenu);
                        this.tray.popUpContextMenu();
                    }
                }
            }
        );
    }

    setContextMenu(menu) {
        this.tray?.setContextMenu(menu);
    }

    handleTrayClick() {
        const now = Date.now();
        if (now - this.lastClickTime < 350) return;
        this.lastClickTime = now;

        const mainWindow = this.getMainWindow();
        const searchWindow = this.getSearchWindow();

        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            this.onShowApp();
        }

        if (searchWindow && searchWindow.isVisible()) {
            searchWindow.hide();
        } else {
            searchWindow?.show();
        }

        this.onUpdateMenus(true);
    }

    startAnimation() {
        if (this.animationTimer) {
            this.stopAnimation();
        }

        if (this.cachedFrames.length === 0) {
            const imagePath = path.join(this.iconPath);
            this.baseImage = nativeImage.createFromPath(imagePath);

            const traySize = process.platform === 'darwin' ? 22 : 32;
            const resizedBase = this.baseImage.resize({ width: traySize, height: traySize, quality: 'best' });

            const bitmap = resizedBase.toBitmap();
            const size = resizedBase.getSize();

            const opacities = [0.25, 0.50, 0.75, 1.00];

            this.cachedFrames = opacities.map(opacity => {
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

        this.tray.setToolTip(APP_NAME + ' - Loading...');

        this.animationTimer = setInterval(() => {
            let frameIndex = this.currentStep;
            if (this.currentStep > 3) {
                frameIndex = 6 - this.currentStep;
            }

            if (this.tray && this.cachedFrames[frameIndex]) {
                this.tray.setImage(this.cachedFrames[frameIndex]);
            }

            this.currentStep = (this.currentStep + 1) % 6;
        }, 150);
    }

    stopAnimation() {
        if (this.animationTimer) {
            clearInterval(this.animationTimer);
            this.animationTimer = null;
        }

        if (this.tray && this.cachedFrames[3]) {
            this.tray.setImage(this.cachedFrames[3]);
            this.tray.setToolTip(APP_NAME);
        }

        this.currentStep = 0;
    }

    destroy() {
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
        }
    }
}

module.exports = TrayManager;
