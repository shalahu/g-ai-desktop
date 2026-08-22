const { net } = require('electron');
const BaseAISupplier = require('./BaseAISupplier');
const CHAT_GPT_URL = 'https://chatgpt.com/';
const CHAT_GPT_NAME = 'ChatGPT';

class ChatGPTSupplier extends BaseAISupplier {
    constructor() {
        super('openai_chatgpt', CHAT_GPT_NAME, CHAT_GPT_URL, true);
    }

    checkRealChatURL(currentURL) {
        const chatgptChatRegex = /chatgpt\.com\/c\/([0-9a-fA-F]{8}|[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;
        return chatgptChatRegex.test(currentURL);
    }

    async isRealChatReady(webContents) {
        return await webContents.executeJavaScript(`
                !!(document.querySelector('div[class*="_convSearchResultHighlightRoot"]'))
                `);
    }

    getQuickLauncherJS() {
        return `
            (function() {
                const inputEl = document.querySelector('form');
                if (!inputEl) return null;
                const modeEl = document.getElementById('thread-bottom')?.nextElementSibling?.querySelector('div[data-testid="use-case-prompt-chips"]');

                document.documentElement.style['-webkit-app-region'] = 'drag';
                inputEl.style['-webkit-app-region'] = 'no-drag';
                if (modeEl) {
                    modeEl.style['-webkit-app-region'] = 'no-drag';
                }

                const modeDomRect = modeEl?.getBoundingClientRect();
                const inputDomRect = inputEl.getBoundingClientRect();
                const inputDomRectHeight = inputDomRect.height + (modeDomRect ? modeDomRect.height : 0); 

                const overlayEl = document.querySelector('.popover');

                let overlayHeight = inputDomRectHeight; 
                let top = inputDomRect.top;

                if (overlayEl) {
                    document.documentElement.style['-webkit-app-region'] = 'no-drag';
                    const overlayDomRect = overlayEl.getBoundingClientRect();
                    if (overlayDomRect.y + overlayDomRect.height > inputDomRect.y + inputDomRectHeight) {
                        overlayHeight = inputDomRect.height + overlayDomRect.height;
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
        return ['theme'];
    }

    handleLocalStorageThemeBridge({ key, value, toggleTheme }) {
        if (key !== 'theme') return undefined;

        toggleTheme(value.includes('system') ? 'system' : (value.includes('dark') ? 'dark' : 'light'));

        return null;
    }

    async applyViewTheme({ tabView, theme, currentTheme, setLocalStorage, removeLocalStorage }) {
        if (!(this.matchesUrl(tabView.webContents.getURL()))) {
            return false;
        }

        const htmlClassList = await tabView.webContents.executeJavaScript("Array.from(document.documentElement.classList);");

        if (!(htmlClassList.includes('dark') || htmlClassList.includes('light'))) {
            return false;
        }

        setLocalStorage(tabView, 'theme', `${theme}`);
        return true;
    }

    async getExportHtmlContent(webContents, type) {
        const executionResult = await webContents.executeJavaScript(`
            new Promise((resolve) => {
                setTimeout(() => {
                    const mainLinkElement = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find(el => el.href && el.href.includes('/root'));
                    const dynamicCssUrl = mainLinkElement ? mainLinkElement.href : "";

                    const rawHtml = document.documentElement.outerHTML;
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(rawHtml, 'text/html');
                    doc.querySelectorAll('script, link[as="script"]').forEach(el => el.remove());

                    const baseElement = doc.createElement('base');
                    baseElement.setAttribute('href', '${CHAT_GPT_URL}'); 
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
                .export-title, #page-header  {
                    display: none !important;
                }
                ${extractedPrintStyles}
            </style>
            <h1 class="export-title">${String(title ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))} - ${CHAT_GPT_NAME}</h1>
            `;

        return htmlContent + forcedPrintStyles;
    }
}

module.exports = ChatGPTSupplier;