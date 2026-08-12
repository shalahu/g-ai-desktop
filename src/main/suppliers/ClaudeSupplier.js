const { net } = require('electron');
const BaseAISupplier = require('./BaseAISupplier');
const CLAUDE_URL = 'https://claude.ai/new';
const CLAUDE_NAME = 'Claude';

class ClaudeSupplier extends BaseAISupplier {
    constructor() {
        super('anthropic_claude', CLAUDE_NAME, CLAUDE_URL, true);
    }

    checkRealChatURL(currentURL) {
        const dsChatRegex = /claude\.ai\/chat\/([0-9a-fA-F]{8}|[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;
        return dsChatRegex.test(currentURL);
    }

    async isRealChatReady(webContents) {
        return await webContents.executeJavaScript(`
                !!(document.querySelector('div[role="feed"]') && document.querySelector('div[data-index]'))
                `);
    }

    getQuickLauncherJS() {
        return `
            (function() {
                const inputEl = document.querySelector('fieldset')?.parentElement.parentElement;
                if (!inputEl) return null;
                const modeEl = inputEl.nextElementSibling;

                document.documentElement.style['-webkit-app-region'] = 'drag';
                inputEl.style['-webkit-app-region'] = 'no-drag';

                if (modeEl) {
                    modeEl.style['-webkit-app-region'] = 'no-drag';
                }

                const modeDomRect = modeEl?.getBoundingClientRect();
                const inputDomRect = inputEl.getBoundingClientRect();
                const inputDomRectHeight = inputDomRect.height + (modeDomRect ? modeDomRect.height : 0); 

                const overlayEl = document.querySelector('div[data-open]');

                let overlayHeight = inputDomRectHeight; 
                let top = inputDomRect.top;

                if (overlayEl) {
                    document.documentElement.style['-webkit-app-region'] = 'no-drag';
                    const overlayDomRect = overlayEl.getBoundingClientRect();
                    if (overlayDomRect.y + overlayDomRect.height > inputDomRect.y + inputDomRectHeight) {
                        overlayHeight = inputDomRect.height + overlayDomRect.height - (inputDomRect.y + inputDomRect.height - overlayDomRect.y);
                    }
                } else {
                    document.documentElement.style['-webkit-app-region'] = 'drag';
                    inputEl.style['-webkit-app-region'] = 'no-drag';
                    if (modeEl) {
                        modeEl.style['-webkit-app-region'] = 'no-drag';
                    }
                }

                return {
                    width: inputDomRect.width,
                    height: overlayHeight,
                    top: top,
                    left: inputDomRect.left
                };
            })();
        `;
    }

    getLocalStorageThemeBridgeKeys() {
        return ['LSS-userThemeMode'];
    }

    handleLocalStorageThemeBridge({ key, value, toggleTheme }) {
        if (key !== 'LSS-userThemeMode') return undefined;

        toggleTheme(value.includes('auto') ? 'system' : (value.includes('dark') ? 'dark' : 'light'));

        return null;
    }

    async applyViewTheme({ tabView, theme, currentTheme, setLocalStorage, removeLocalStorage }) {
        const currentDataTheme = await tabView.webContents.executeJavaScript("document.querySelector('[data-mode]')?.getAttribute('data-mode');");
        if (!(currentDataTheme === 'dark' || currentDataTheme === 'light')) {
            return false;
        }

        const json = JSON.stringify({
            value: theme === 'system' ? 'auto' : theme,
            tabId: crypto.randomUUID(),
            timestamp: Date.now()
        });
        setLocalStorage(tabView, 'LSS-userThemeMode', json);

        return true;
    }

    async getExportHtmlContent(webContents, type) {
        const executionResult = await webContents.executeJavaScript(`
            new Promise((resolve) => {
                setTimeout(() => {
                    const mainLinkElement = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find(el => el.href && !el.href.includes('/shared'));
                    const dynamicCssUrl = mainLinkElement ? mainLinkElement.href : "";

                    const rawHtml = document.documentElement.outerHTML;
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(rawHtml, 'text/html');
                    doc.querySelectorAll('script, link[as="script"]').forEach(el => el.remove());

                    const baseElement = doc.createElement('base');
                    baseElement.setAttribute('href', '${CLAUDE_URL}'); 
                    const head = doc.querySelector('head');
                    if (head) {
                        head.insertBefore(baseElement, head.firstChild);
                    }

                    resolve({
                        html: doc.documentElement.outerHTML,
                        cssUrl: dynamicCssUrl,
                        title: document.title
                    });
                }, 150); 
            });
        `);

        const htmlContent = executionResult.html;
        const dynamicCssUrl = executionResult.cssUrl;
        const title = executionResult.title;

        let remoteCssText = "";
        if (dynamicCssUrl) {
            try {
                const response = await net.fetch(dynamicCssUrl);
                remoteCssText = await response.text();
            } catch (netErr) { }
        }

        let extractedPrintStyles = "";
        if (remoteCssText) {
            let index = 0;
            const target = "@media print";

            while ((index = remoteCssText.toLowerCase().indexOf(target, index)) !== -1) {
                let startBrace = remoteCssText.indexOf("{", index + target.length);
                if (startBrace === -1) break;

                let braceCount = 1;
                let currentPos = startBrace + 1;
                let innerContent = "";

                while (braceCount > 0 && currentPos < remoteCssText.length) {
                    let char = remoteCssText[currentPos];
                    if (char === "{") {
                        braceCount++;
                    } else if (char === "}") {
                        braceCount--;
                    }

                    if (braceCount > 0) {
                        innerContent += char;
                    }
                    currentPos++;
                }

                if (innerContent) {
                    extractedPrintStyles += innerContent.trim() + "\n";
                }

                index = currentPos;
            }
        }

        const forcedPrintStyles = `
            <style>
                .export-title, header  {
                    display: none !important;
                }
                ${extractedPrintStyles}
            </style>
            <h1 class="export-title">${title} - ${CLAUDE_NAME}</h1>
            `;

        return htmlContent + forcedPrintStyles;
    }
}

module.exports = ClaudeSupplier;