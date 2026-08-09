const { Menu, app } = require('electron');
const { getConfig, saveConfig } = require('../config');
const {
    IS_MAC,
    IS_LINUX,
    DEFAULT_ZOOM_FACTOR,
    MAX_ZOOM_FACTOR,
    MIN_ZOOM_FACTOR,
    DEFAULT_APP_HEADER_HEIGHT,
    DEFAULT_TITLE_BAR_HEIGHT
} = require('../constants');
const { getAllSuppliers, getDefaultSupplier, isDefaultSupplier, isDefaultSupplierSet } = require('../suppliers');

class MenuManager {
    constructor({
        windowManager,
        trayManager,
        onShowAppAndAddNewTab,
        onTriggerExport,
        onCreateNewTabBackend,
        onToggleApplicationTheme,
        onToggleTitleBar,
        onQuitApp,
        onCheckForUpdates,
        onGetAppWebsiteFullURL,
        onIsMainWindowVisible
    }) {
        this.windowManager = windowManager;
        this.trayManager = trayManager;
        this.onShowAppAndAddNewTab = onShowAppAndAddNewTab;
        this.onTriggerExport = onTriggerExport;
        this.onCreateNewTabBackend = onCreateNewTabBackend;
        this.onToggleApplicationTheme = onToggleApplicationTheme;
        this.onToggleTitleBar = onToggleTitleBar;
        this.onQuitApp = onQuitApp;
        this.onCheckForUpdates = onCheckForUpdates;
        this.onGetAppWebsiteFullURL = onGetAppWebsiteFullURL;
        this.onIsMainWindowVisible = onIsMainWindowVisible;

        this.menuItemsRegistry = new Map();
        this.barMenusTemplate = [];
        this.addTabItems = [];
    }

    getMenuItem(id) {
        return this.menuItemsRegistry.get(id);
    }

    createContextMenu(isTray) {
        const menuTemplate = [];
        const suppliers = getAllSuppliers();

        let newTabItem = null;
        let quickLauncherItem = null;
        this.addTabItems = [];

        if (isDefaultSupplierSet()) {
            const defaultAISupplier = getDefaultSupplier();
            newTabItem = {
                id: 'm-newtab',
                label: 'New Tab - ' + defaultAISupplier.label,
                click: () => {
                    this.onShowAppAndAddNewTab();
                }
            };
            quickLauncherItem = {
                id: 'm-newQuickLauncher',
                label: 'New Quick Launcher - ' + defaultAISupplier.label,
                click: () => {
                    this.onShowAppAndAddNewTab(null, true);
                }
            };
        } else {
            const addLauncherItems = [];
            suppliers.map((supplier) => {
                this.addTabItems.push({
                    id: 'm-newtab-' + supplier.id,
                    label: supplier.label,
                    click: () => {
                        this.onShowAppAndAddNewTab(supplier.landingPage);
                    }
                });

                addLauncherItems.push({
                    id: 'm-newQuickLauncher-' + supplier.id,
                    label: supplier.label,
                    click: () => {
                        this.onShowAppAndAddNewTab(supplier.landingPage, true);
                    }
                })
            });

            newTabItem = {
                id: 'm-newtab',
                label: 'New Tab',
                submenu: this.addTabItems
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
                await this.onQuitApp(true);
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
                            this.onTriggerExport('html');
                        }
                    },
                    {
                        id: "m-exprot-pdf",
                        label: 'PDF',
                        click: (menuItem) => {
                            this.onTriggerExport('pdf');
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
            label: (this.onIsMainWindowVisible() ? 'Hide' : 'Show') + ' Window',
            click: () => {
                this.trayManager.handleTrayClick();
            }
        };

        const toggleTitleBarItem = {
            id: "m-menubar",
            label: (getConfig('autoHideTitleBar') ? 'Show' : 'Hide') + ' Title Bar',
            visible: !IS_LINUX,
            enabled: !IS_LINUX,
            accelerator: 'CmdOrCtrl+Shift+M',
            click: (menuItem) => {
                this.onToggleTitleBar();
            }
        };

        if (isTray) {
            menuTemplate.push(toggleWindowVisibilityItem);
            menuTemplate.push(toggleTitleBarItem);
            menuTemplate.push(separatorItem);
            menuTemplate.push(exitItem);
        }
        else {
            const zoomFacotrLabel = this.windowManager.currentZoomFactor === DEFAULT_ZOOM_FACTOR ? '' : ' (' + Math.round(this.windowManager.currentZoomFactor * 100) + '%)'
            const viewItem = {
                id: "view-menu",
                label: "View",
                submenu: [
                    {
                        id: "m-zoomin",
                        label: 'Zoom In' + zoomFacotrLabel,
                        enabled: this.windowManager.currentZoomFactor != MAX_ZOOM_FACTOR,
                        accelerator: 'CmdOrCtrl+=',
                        click: (menuItem) => {
                            this.windowManager.zoomApp(0.1)
                        }
                    },
                    {
                        id: "m-zoomout",
                        label: 'Zoom Out' + zoomFacotrLabel,
                        enabled: this.windowManager.currentZoomFactor != MIN_ZOOM_FACTOR,
                        accelerator: 'CmdOrCtrl+-',
                        click: (menuItem) => {
                            this.windowManager.zoomApp(-0.1)
                        }
                    },
                    {
                        id: "m-zoomactual",
                        label: 'Actual Size',
                        accelerator: 'CmdOrCtrl+0',
                        click: (menuItem) => {
                            this.windowManager.zoomApp(0)
                        }
                    },
                    separatorItem,
                    {
                        id: "m-fullscreen",
                        label: 'Toggle Fullscreen',
                        accelerator: 'F11',
                        click: (menuItem) => {
                            this.windowManager.toggleFullscreen();
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
                                    this.onToggleApplicationTheme('system');
                                }
                            },
                            {
                                id: "m-th-light",
                                label: 'Light',
                                type: 'radio',
                                checked: getConfig('theme') === 'light',
                                click: (menuItem) => {
                                    this.onToggleApplicationTheme('light');
                                }
                            },
                            {
                                id: "m-th-dark",
                                label: 'Dark',
                                type: 'radio',
                                checked: getConfig('theme') === 'dark',
                                click: (menuItem) => {
                                    this.onToggleApplicationTheme('dark');
                                }
                            }
                        ]
                    },
                    toggleTitleBarItem    
                ]
            };
            menuTemplate.push(viewItem);

            const landingPageItems = [{
                id: "m-nta-let-me-choose",
                label: 'Let Me Choose',
                type: 'radio',
                checked: !isDefaultSupplierSet(),
                click: (menuItem) => {
                    saveConfig('defaultAISupplier', '');
                    saveConfig('openNewTabOnStartup', !menuItem.checked);
                    this.updateMenus(true);
                }
            },
                separatorItem
            ];
            suppliers.forEach((supplier) => {
                landingPageItems.push({
                    id: supplier.id,
                    label: supplier.label,
                    type: 'radio',
                    checked: isDefaultSupplier(supplier.id),
                    click: (menuItem) => {
                        saveConfig('defaultAISupplier', supplier.id);
                        this.updateMenus(true);
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
                                label: 'Open New Tab - ' + (isDefaultSupplierSet() ? getDefaultSupplier().label : 'Let Me Choose...'),
                                type: 'checkbox',
                                enabled: isDefaultSupplierSet(),
                                checked: !isDefaultSupplierSet() || getConfig('openNewTabOnStartup'),
                                click: (menuItem) => {
                                    saveConfig('openNewTabOnStartup', menuItem.checked);
                                    this.updateMenus();
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
                                    this.updateMenus();
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
                                    this.updateMenus();
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
                                    this.updateMenus();
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
                                    this.updateMenus();
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
                                    this.updateMenus();
                                }
                            },
                            {
                                id: "m-tb-newtab",
                                label: 'Open New Tab - ' + (isDefaultSupplierSet() ? getDefaultSupplier().label : 'Let Me Choose...'),
                                type: 'radio',
                                checked: getConfig('iconDefaults') === 'openNewTab',
                                click: (menuItem) => {
                                    saveConfig('iconDefaults', 'openNewTab');
                                    this.updateMenus();
                                }
                            },
                            {
                                id: "m-tb-quick-launcher",
                                label: 'Open Quick Launcher - ' + (isDefaultSupplierSet() ? getDefaultSupplier().label : 'Let Me Choose...'),
                                type: 'radio',
                                checked: getConfig('iconDefaults') === 'openQuickLauncher',
                                click: (menuItem) => {
                                    saveConfig('iconDefaults', 'openQuickLauncher');
                                    this.updateMenus();
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
                            this.onCreateNewTabBackend(this.onGetAppWebsiteFullURL('issues'));
                        }
                    },
                    separatorItem,
                    {
                        id: "m-help-view-license",
                        label: "View License",
                        click: (menuItem) => {
                            this.onCreateNewTabBackend(this.onGetAppWebsiteFullURL(`?tab=MIT-1-ov-file#MIT-1-ov-file`));
                        }
                    },
                    {
                        id: "m-help-disclaimer-statement",
                        label: "Disclaimer Statement",
                        click: (menuItem) => {
                            this.onCreateNewTabBackend(this.onGetAppWebsiteFullURL(`?tab=readme-ov-file#%EF%B8%8F-disclaimer`));
                        }
                    },
                    separatorItem,
                    {
                        id: "m-help-check-for-updates",
                        label: "Check for Updates...",
                        click: async (menuItem) => {
                            await this.onCheckForUpdates();
                        }
                    },
                    separatorItem,
                    {
                        id: "m-help-about",
                        label: "About (V" + app.getVersion() + ')',
                        click: (menuItem) => {
                            this.onCreateNewTabBackend(this.onGetAppWebsiteFullURL(''));
                        }
                    }
                ]
            };
            menuTemplate.push(helpItem);

            this.barMenusTemplate = menuTemplate;
        }

        return Menu.buildFromTemplate(menuTemplate);
    }

    updateMenus(updateTrayMenus = false, updateAppMenus = true) {
        if (updateTrayMenus) {
            this.trayManager.setContextMenu(this.createContextMenu(true));
        }
        if (updateAppMenus) {
            Menu.setApplicationMenu(this.createContextMenu(false));
            this.updateMenuBar();
        }
    }

    updateMenuBar() {
        this.menuItemsRegistry.clear();
        this.registerMenuItems(this.barMenusTemplate);

        const jsonReadyData = this.prepareTemplateForRenderer(this.barMenusTemplate);
        const hideTitleBar = getConfig('autoHideTitleBar');
        const tabbarIsHidden = this.windowManager.baseAppHeaderHeight === (DEFAULT_APP_HEADER_HEIGHT - DEFAULT_TITLE_BAR_HEIGHT);
        const addTabJsonReadyData = this.prepareTemplateForRenderer(this.addTabItems);

        this.windowManager.baseAppHeaderHeight = hideTitleBar
            ? (tabbarIsHidden ? this.windowManager.baseAppHeaderHeight : this.windowManager.baseAppHeaderHeight - DEFAULT_TITLE_BAR_HEIGHT)
            : (tabbarIsHidden ? this.windowManager.baseAppHeaderHeight + DEFAULT_TITLE_BAR_HEIGHT : this.windowManager.baseAppHeaderHeight);

        this.windowManager.appHeaderHeight = Math.round(this.windowManager.baseAppHeaderHeight * this.windowManager.currentZoomFactor);

        this.windowManager.titleBarView.webContents.send('update-menus', { jsonReadyData, hideTitleBar, addTabJsonReadyData });
    }

    registerMenuItems(template) {
        template.map(item => {
            if (item.id) {
                this.menuItemsRegistry.set(item.id, item);
            }

            if (item.submenu) {
                this.registerMenuItems(item.submenu);
            }
        });
    }

    prepareTemplateForRenderer(template) {
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
                newItem.submenu = this.prepareTemplateForRenderer(newItem.submenu);
                newItem.RemoveTabIndex = true;
            }
            return newItem;
        });
    }
}

module.exports = MenuManager;
