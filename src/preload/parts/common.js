const { ipcRenderer } = require('electron');

window.addEventListener('local-storage-set-bridge', async (event) => {
    const { key, value } = event.detail;
    const action = await ipcRenderer.invoke('local-storage-theme-bridge', { key, value });

    if (action && window.__onHandleLocalStorageThemeBridgeActions && window.__onHandleLocalStorageThemeBridgeActions[action]) {
        window.__onHandleLocalStorageThemeBridgeActions[action]();
    }
});

window.addEventListener('local-storage-remove-bridge', async () => {
    await ipcRenderer.invoke('toggle-theme-from-ui', null);
});

window.addEventListener('export-html-content', async (event) => {
    const { htmlContent, type } = event.detail;

    await ipcRenderer.invoke('export-html-content', event.detail);
});

window.addEventListener('mouse-enter-menu', async (event) => {
    await ipcRenderer.invoke('mouse-enter-menu');
});

window.addEventListener('DOMContentLoaded', async () => {
    try {
        Object.defineProperty(window, 'parent', { get: () => window });
        window.open = (url) => { window.location.href = url; return window; };

        for (const action of window.__onDOMContentLoadedActions || []) {
            await action();
        }
    } catch (e) { }
});

window.addEventListener('wheel', async (event) => {
    if (event.ctrlKey || event.metaKey) {
        if (event.deltaY < 0) {
            event.preventDefault();
            await ipcRenderer.invoke('zoom-app', 0.1);
        } else {
            event.preventDefault();
            await ipcRenderer.invoke('zoom-app', -0.1);
        }
    }
});

window.addEventListener('mousedown', async (event) => {
    const isCtrlClick = event.ctrlKey || event.metaKey;
    const isMiddleButton = event.button === 1;

    if (isCtrlClick && isMiddleButton) {
        event.preventDefault();
        await ipcRenderer.invoke('zoom-app', 0);
    }
});

window.addEventListener('quick-launcher-changed', async (event) => {
    await ipcRenderer.invoke('quick-launcher-changed', event.detail);
});

window.addEventListener('net-fetch-html-request', async (event) => {
    const { requestId, src } = event.detail;
    const htmlResult = await ipcRenderer.invoke('net-fetch-html', { src });

    const responseEvent = new CustomEvent('net-fetch-html-response', {
        detail: {
            requestId: requestId,
            html: htmlResult
        }
    });
    window.dispatchEvent(responseEvent);
});
