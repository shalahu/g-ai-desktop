let themeSelectorBtnsObserver = null;

window.addEventListener('cookie-color-theme-changed', async (event) => {
    await ipcRenderer.invoke('toggle-theme-from-ui', event.detail.theme);
});

window.addEventListener('copilot-color-theme-changed', (event) => {
    initThemeSelector();
});

function initThemeSelector() {
    themeSelectorBtnsObserver = new MutationObserver(async (mutations, obs) => {
        let selectors = document.querySelectorAll('button[aria-label="Mico"],button[aria-label="Sage"],button[aria-label="Pax"]');
        if (selectors.length > 2) {
            obs.disconnect();
            const currentTheme = await ipcRenderer.invoke('get-config', 'theme');
            await ipcRenderer.invoke('toggle-theme-from-main', currentTheme);
        };
    });

    themeSelectorBtnsObserver.observe(document.body, { childList: true, subtree: true });
}