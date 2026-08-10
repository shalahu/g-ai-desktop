let themeSelectorBtnsObserver = null;

function initThemeSelector() {
    const selector = '.ds-modal-wrapper';
    const buttonSelector = `div.ds-button--outlined[role='button']`;

    themeSelectorBtnsObserver = new MutationObserver(async (mutations, obs) => {
        let element = document.querySelector(selector);
        if (element) {
            const elements = document.querySelectorAll(buttonSelector);
            obs.disconnect();

            const currentTheme = await ipcRenderer.invoke('get-config', 'theme');
            const themes = ['light', 'dark', 'system'];
            for (let i = 0; i < themes.length; i++) {
                if (themes[i] === currentTheme) {
                    elements[i].click();
                    break;
                }
            }
        };
    });

    themeSelectorBtnsObserver.observe(document.body, { childList: true, subtree: true });
}

window.__onDOMContentLoadedActions = window.__onDOMContentLoadedActions || [];
window.__onDOMContentLoadedActions.push(() => {
    if (window.location.href.toLowerCase().includes('deepseek.com')) {
        initThemeSelector();
    }
});

window.__onHandleLocalStorageThemeBridgeActions = window.__onHandleLocalStorageThemeBridgeActions || {};
window.__onHandleLocalStorageThemeBridgeActions['init-theme-selector'] = () => initThemeSelector();
