const { ipcRenderer } = require('electron');

window.addEventListener('local-storage-set-bridge', (event) => {
    const latestValue = event.detail;

    ipcRenderer.invoke('web-theme-changed', latestValue === "Bard-Dark-Theme" ? 'dark' : 'light').catch(() => {});
});

window.addEventListener('local-storage-remove-bridge', () => {
    ipcRenderer.invoke('web-theme-changed', null).catch(() => {});
});

window.addEventListener('export-html-content', (event) => {
    const { htmlContent, type } = event.detail;

    ipcRenderer.invoke('export-html-content', event.detail).catch(() => {});
});

window.addEventListener('mouse-enter-menu', (event) => {
    ipcRenderer.invoke('mouse-enter-menu').catch(() => {});
});

window.addEventListener('DOMContentLoaded', () => {
  try {
    // Object.defineProperty(window, 'top', { get: () => window });
    Object.defineProperty(window, 'parent', { get: () => window });
    window.open = (url) => { window.location.href = url; return window; };
  } catch (e) { }
});

// ipcRenderer.on('theme-changed', (event, themeName) => {
//   if (typeof window.__SET_APP_THEME__ === 'function') {
//     window.__SET_APP_THEME__(themeName);
//   }
// });
