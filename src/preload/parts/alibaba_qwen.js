let themeSelectorBtnsObserver = null;

window.addEventListener('cookie-qwen-theme-changed', async (event) => {
    await ipcRenderer.invoke('toggle-theme-from-ui', event.detail.theme);
});

window.addEventListener('qwen-theme-changed', (event) => {
    initThemeSelector();
});

function initThemeSelector() {
    themeSelectorBtnsObserver = new MutationObserver(async (mutations, obs) => {
        let element = window.location.href.toLowerCase() === 'https://chat.qwen.ai/settings/general';
        if (element) {
            const elements = document.querySelectorAll('input[class="ant-segmented-item-input"]');
            obs.disconnect();

            const currentTheme = await ipcRenderer.invoke('get-config', 'theme');
            const themes = ['system', 'light', 'dark'];
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