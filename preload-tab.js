const { ipcRenderer } = require('electron');

let themeSelectorBtnsObserver = null;

function waitForUploadFileAddBtns(selector, suggestedSelector, buttonSelector) {
    return new Promise((resolve) => {
        let elements = document.querySelectorAll(selector);
        if (elements.length === 0) {
            elements = document.querySelectorAll(suggestedSelector);
        }
        if (elements.length > 0) {
            const elements = document.querySelectorAll(buttonSelector);
            return resolve(elements);
        };

        const observer = new MutationObserver((mutations, obs) => {
            let elements = document.querySelectorAll(selector);
            if (elements.length === 0) {
                elements = document.querySelectorAll(suggestedSelector);
            }
            if (elements.length > 0) {
                const elements = document.querySelectorAll(buttonSelector);
                obs.disconnect();
                return resolve(elements);
            };
        });

        observer.observe(document.body, { childList: true, subtree: true });
    });
}

async function simulateFileDrop(inputElement, filePaths) {
    const dataTransfer = new DataTransfer();

    for (const filePath of filePaths) {
        const fileInfo = await ipcRenderer.invoke('get-file-data', filePath);
        const realBlob = new Blob([fileInfo.bytes], { type: fileInfo.type });

        const realFile = new File([realBlob], fileInfo.name, { type: fileInfo.type });

        dataTransfer.items.add(realFile);
    }

    inputElement.files = dataTransfer.files;

    const changeEvent = new Event('change', { bubbles: true });
    inputElement.dispatchEvent(changeEvent);
}

function initUploadFileInput() {
    const suggestedSelector = 'div[data-xid="aim-suggested-turn"]';
    const selector = 'div[data-scope-id="turn"]';
    const buttonSelector = 'button:has(path[d="M440-440H200v-80H440V-760h80v240H760v80H520v240H440V-440Z"])';

    waitForUploadFileAddBtns(selector, suggestedSelector, buttonSelector).then((addBtns) => {
        addBtns.forEach(addBtn => {
            addBtn.addEventListener('click', () => {
                setTimeout(() => {
                    const textInputs = document.querySelectorAll('input[type="file"]');

                    if (textInputs.length > 0) {
                        textInputs.forEach(input => {
                            input.addEventListener('click', async (e) => {
                                e.preventDefault();

                                const acceptType = e.target.accept;

                                try {
                                    const selectedFiles = await ipcRenderer.invoke('upload-files', acceptType);
                                    if (selectedFiles.length === 0) {
                                        return;
                                    }
                                    else {
                                        simulateFileDrop(e.target, selectedFiles);
                                    }

                                } catch (error) { }
                            });
                        });
                    }
                }, 0);
            });
        });
    });
}

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

window.addEventListener('local-storage-set-bridge', async (event) => {
    const key = event.detail.key;
    const value = event.detail.value;
    switch (key) {
        case 'Bard-Color-Theme':
            await ipcRenderer.invoke('web-theme-changed', value === "Bard-Dark-Theme" ? 'dark' : 'light');
            break;
        case '__appKit_@deepseek/chat_themePreference':
        case 'CUSTOM_THEME':
            await ipcRenderer.invoke('web-theme-changed', value.includes('system') ? null : (value.includes('dark') ? 'dark' : 'light'));
            initThemeSelector();
            break;
    }

});

window.addEventListener('local-storage-remove-bridge', async () => {
    await ipcRenderer.invoke('web-theme-changed', null);
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

        if (await ipcRenderer.invoke('is-google-search-ai-mode-real-chat-url', window.location.href)) {
            setTimeout(() => { initUploadFileInput(); }, 1500);
        } else if (window.location.href.toLowerCase().includes('deepseek.com')) {
            initThemeSelector();
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