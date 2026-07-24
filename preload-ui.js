const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getCurrentTheme: () => ipcRenderer.invoke('get-current-theme'),
  // getConstants: () => ipcRenderer.invoke('get-constants'),
  getDefaultAISupplier: () => ipcRenderer.invoke('get-default-ai-supplier'),
  mouseEnterMenu: () => ipcRenderer.invoke('mouse-enter-menu'),
  mouseLeaveMenu: () => ipcRenderer.invoke('mouse-leave-menu'),
  minWindow: () => ipcRenderer.invoke('min-window'),
  maxWindow: () => ipcRenderer.invoke('max-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  menusUpdated: () => ipcRenderer.invoke('menus-updated'),

  // toggleThemeFromUI: (data) => ipcRenderer.invoke('toggle-theme-from-ui', data),
  createTab: (data) => ipcRenderer.invoke('create-tab', data),
  switchTab: (data) => ipcRenderer.invoke('switch-tab', data),
  closeTab: (data) => ipcRenderer.invoke('close-tab', data),
  changeWindowBg: (data) => ipcRenderer.invoke('change-window-bg', data),
  saveConfig: (data) => ipcRenderer.invoke('save-config', data),
  getConfig: (data) => ipcRenderer.invoke('get-config', data),
  clickMenuItem: (data) => ipcRenderer.invoke('click-menu-item', data),
  exportHtmlContent: (data) => ipcRenderer.invoke('export-html-content', data),

  onNewTabCreated: (callback) => ipcRenderer.on('new-tab-created', (e, data) => callback(data)),
  onTitleChanged: (callback) => ipcRenderer.on('title-changed', (e, data) => callback(data)),
  // onUrlChanged: (callback) => ipcRenderer.on('url-changed', (e, data) => callback(data)),
  onThemeChanged: (callback) => ipcRenderer.on('theme-changed', (e, data) => callback(data)),
  onSetTabBarBackground: (callback) => ipcRenderer.on('set-tab-bar-background', (e, data) => callback(data)),
  onUpdateMenus: (callback) => ipcRenderer.on('update-menus', (e, data) => callback(data)),
});