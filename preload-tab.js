const { ipcRenderer } = require('electron');

function waitForElement(selector, suggestedSelector, buttonSelector) {
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

    waitForElement(selector, suggestedSelector, buttonSelector).then((addBtns) => {
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

window.addEventListener('local-storage-set-bridge', async (event) => {
    const latestValue = event.detail;

    await ipcRenderer.invoke('web-theme-changed', latestValue === "Bard-Dark-Theme" ? 'dark' : 'light');
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
        // Object.defineProperty(window, 'top', { get: () => window });
        Object.defineProperty(window, 'parent', { get: () => window });
        window.open = (url) => { window.location.href = url; return window; };

        // const constants = await ipcRenderer.invoke('get-constants');
        const isGoogleSeachAIModeRealChatURL = await ipcRenderer.invoke('is-google-search-ai-mode-real-chat-url');
        if (isGoogleSeachAIModeRealChatURL) {
            initUploadFileInput();
        }
    } catch (e) { }
});

// ipcRenderer.on('theme-changed', (event, themeName) => {
//   if (typeof window.__SET_APP_THEME__ === 'function') {
//     window.__SET_APP_THEME__(themeName);
//   }
// });
