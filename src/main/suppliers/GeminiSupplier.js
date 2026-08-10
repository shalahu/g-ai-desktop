const BaseAISupplier = require('./BaseAISupplier');

class GeminiSupplier extends BaseAISupplier {
    constructor() {
        super('google_gemini', 'Google Gemini', 'https://gemini.google.com/app');
    }

    checkRealChatURL(currentURL) {
        const geminiChatRegex = /gemini\.google\.com\/app\/[0-9a-fA-F]{16}/;
        return geminiChatRegex.test(currentURL);
    }

    async isRealChatReady(webContents) {
        return await webContents.executeJavaScript(`
                !!(document.querySelector('.conversation-container') && document.querySelector('conversation-actions-icon') && document.querySelector('[trace="ChatContainer"]'))
                `);
    }

    getQuickLauncherJS() {
        return `
            (function() {
                const inputEl = document.querySelector('.text-input-field');
                if (!inputEl) return null;

                document.documentElement.style['-webkit-app-region'] = 'drag';
                inputEl.style['-webkit-app-region'] = 'no-drag';
                const inputDomRect = inputEl.getBoundingClientRect();
                const overlayEl = document.querySelector('.cdk-overlay-pane');

                let overlayHeight = 0; 
                let top = inputDomRect.top;
                
                if (overlayEl) {
                    document.documentElement.style['-webkit-app-region'] = 'no-drag';
                    const overlayDomRect = overlayEl.getBoundingClientRect();
                    if (overlayDomRect.y + overlayDomRect.height > inputDomRect.y + inputDomRect.height) {
                        overlayHeight = overlayDomRect.height - (inputDomRect.y + inputDomRect.height - overlayDomRect.y);
                    }

                    if (overlayDomRect.y < inputDomRect.y) {
                        top = overlayDomRect.top;
                        overlayHeight = inputDomRect.y - overlayDomRect.y;
                    }
                } else {
                    document.documentElement.style['-webkit-app-region'] = 'drag';
                    inputEl.style['-webkit-app-region'] = 'no-drag';
                }

                return {
                    width: inputDomRect.width,
                    height: inputDomRect.height + overlayHeight,
                    top: top,
                    left: inputDomRect.left
                };
            })();
        `;
    }

    getLocalStorageThemeBridgeKeys() {
        return ['Bard-Color-Theme'];
    }

    handleLocalStorageThemeBridge({ key, value, toggleTheme }) {
        if (key !== 'Bard-Color-Theme') return undefined;

        toggleTheme(value === "Bard-Dark-Theme" ? 'dark' : 'light');
        return null;
    }

    async applyViewTheme({ tabView, theme, currentTheme, setLocalStorage, removeLocalStorage }) {
        const bodyClassList = await tabView.webContents.executeJavaScript("Array.from(document.body.classList);");

        if (!(bodyClassList.includes('dark-theme') || bodyClassList.includes('light-theme'))) {
            return false;
        }

        tabView.webContents.executeJavaScript(currentTheme === 'dark'
            ? "document.body.classList.replace('light-theme', 'dark-theme');"
            : "document.body.classList.replace('dark-theme', 'light-theme');");

        let colorTheme = null;
        if (theme === 'dark') {
            colorTheme = "Bard-Dark-Theme";
        } else if (theme === 'light') {
            colorTheme = "Bard-Light-Theme";
        }

        if (colorTheme) {
            setLocalStorage(tabView, 'Bard-Color-Theme', colorTheme);
        } else {
            removeLocalStorage(tabView, 'Bard-Color-Theme');
        }

        return true;
    }

    async getExportHtmlContent(webContents, type) {
        const jsCode = `
            (function() {
                try {
                    const iframePrototype = HTMLIFrameElement.prototype;
                    const nativeGetter = Object.getOwnPropertyDescriptor(iframePrototype, 'contentWindow').get;

                    Object.defineProperty(iframePrototype, 'contentWindow', {
                        get: function() {
                            let win = null;
                            try {
                                win = nativeGetter.call(this);
                            } catch (e1) {
                                try {
                                    win = this.contentDocument ? this.contentDocument.defaultView : null;
                                } catch (e2) {
                                    const nativeDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'parentNode');
                                    if (nativeDesc) {
                                        try {
                                            win = nativeDesc.get.call(this);
                                        } catch (e3) {}
                                    }
                                }
                            }

                            if (win) {
                                const iframeElement = this;
                                win.print = function() {
                                    try {
                                        let htmlContent = "";
                                        try {
                                            iframeElement.contentDocument.querySelector('.export-title').innerText += ' - Google Gemini';
                                            htmlContent = iframeElement.contentDocument.documentElement.innerHTML;
                                        } catch (err) {
                                            try {
                                                win.document.querySelector('.export-title').innerText += ' - Google Gemini';
                                                htmlContent = win.document.documentElement.innerHTML;
                                            } catch (err2) {
                                                document.querySelector('.export-title').innerText += ' - Google Gemini';
                                                htmlContent = document.body.innerHTML;
                                            }
                                        }

                                        window.dispatchEvent(new CustomEvent('export-html-content', {
                                            detail: {
                                                htmlContent: htmlContent,
                                                type: '${type}'
                                            }
                                        }));
                                    } catch (innerError) {}
                                };
                            }

                            return win;
                        },
                        configurable: true,
                        enumerable: true
                    });
                    const observeMenu = () => {
                            return new Promise((resolve) => {
                                const observer = new MutationObserver((mutations, obs) => {
                                const target = document.querySelector('conversation-actions-icon').querySelector('gem-menu-item[value="download-pdf"]');

                                if (target && target.getBoundingClientRect().width > 0) {
                                    obs.disconnect();
                                    resolve(target);
                                }
                                });

                                observer.observe(document.body, {
                                childList: true,
                                subtree: true,
                                attributes: true
                                });
                            });
                        };

                    (async () => {
                        const menuPromise = observeMenu();

                        setTimeout(() => {window.dispatchEvent(new CustomEvent('mouse-enter-menu'));}, 150);
                        
                        document.querySelector('conversation-actions-icon').querySelector('button').click();

                        const menuItem = await menuPromise;

                        menuItem.click();
                        })();
                } catch (e) {}
            })();
            `;

        await webContents.executeJavaScript(jsCode);
        return null;
    }
}

module.exports = GeminiSupplier;
