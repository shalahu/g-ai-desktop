let themeSelectorBtnsObserver = null;

function waitForUploadFileAddBtns(buttonSelector) {
    return new Promise((resolve) => {
        const elements = document.querySelectorAll(buttonSelector);
        if (elements.length > 0) {
            return resolve(elements);
        };

        themeSelectorBtnsObserver = new MutationObserver((mutations, obs) => {
            const elements = document.querySelectorAll(buttonSelector);
            if (elements.length > 0) {
                obs.disconnect();
                return resolve(elements);
            };
        });

        themeSelectorBtnsObserver.observe(document.body, { childList: true, subtree: true });
    });
}

function initThemeSelector() {
    const buttonSelector = 'button[class*="_themeCube"]';

    waitForUploadFileAddBtns(buttonSelector).then((addBtns) => {
        const closeBtn = addBtns[0].closest('div[class*="_content"]')?.querySelector('button[class*="_close"]');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                setTimeout(async () => {
                    initThemeSelector();
                }, 150);
            });
        }
        addBtns.forEach(addBtn => {
            addBtn.addEventListener('click', () => {
                setTimeout(async () => {
                    const themes = ['light', 'dark', 'system'];
                    const elements = document.querySelectorAll(buttonSelector);
                    for (let i = 0; i < themes.length; i++) {
                        if (elements[i]?.getAttribute('aria-pressed') === 'true') {
                            await ipcRenderer.invoke('toggle-theme-from-ui', themes[i]);
                            break;
                        }
                    }
                }, 150);
            });
        });
    });
}

window.__onDOMContentLoadedActions = window.__onDOMContentLoadedActions || [];
window.__onDOMContentLoadedActions.push(async () => {
    setTimeout(() => { initThemeSelector(); }, 1500);
});
