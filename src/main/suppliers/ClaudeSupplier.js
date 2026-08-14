const { net } = require('electron');
const BaseAISupplier = require('./BaseAISupplier');
const CLAUDE_URL = 'https://claude.ai/new';
const CLAUDE_NAME = 'Claude';

class ClaudeSupplier extends BaseAISupplier {
    constructor() {
        super('anthropic_claude', CLAUDE_NAME, CLAUDE_URL, true);
    }

    checkRealChatURL(currentURL) {
        const claudeChatRegex = /claude\.ai\/chat\/([0-9a-fA-F]{8}|[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;
        return claudeChatRegex.test(currentURL);
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
                const inputDomRectWidth = inputDomRect.width; 

                const overlayEls = document.querySelectorAll('div[data-open][role="menu"]');

                let overlayHeight = inputDomRectHeight; 
                let overlayWidth = inputDomRectWidth;
                let overlayLeft = inputDomRect.left;
                let top = inputDomRect.top;

                if (overlayEls.length > 0) {
                    document.documentElement.style['-webkit-app-region'] = 'no-drag';
                    const overlayDomRect = (() => {
                        const rects = Array.from(overlayEls).map(el => el.getBoundingClientRect());
                        if (!rects.length) return { x: 0, y: 0, left: 0, width: 0, height: 0 };
                        const x1 = Math.min(...rects.map(r => r.left)), y1 = Math.min(...rects.map(r => r.top));
                        return { x: x1, y: y1, left: x1, width: Math.max(...rects.map(r => r.right)) - x1, height: Math.max(...rects.map(r => r.bottom)) - y1 };
                    })();
                    if (overlayDomRect.y + overlayDomRect.height > inputDomRect.y + inputDomRectHeight) {
                        overlayHeight = inputDomRect.height + overlayDomRect.height - (inputDomRect.y + inputDomRect.height - overlayDomRect.y);
                    }
                    if (overlayDomRect.x + overlayDomRect.width > inputDomRect.x + inputDomRectWidth) {
                        overlayWidth = inputDomRect.width + overlayDomRect.width - (inputDomRect.x + inputDomRect.width - overlayDomRect.x);
                    }
                    if (overlayDomRect.left < overlayLeft) {
                        const move = overlayLeft - overlayDomRect.left;
                        overlayLeft = overlayDomRect.left;
                        overlayWidth += move ;
                    }   
                } else {
                    document.documentElement.style['-webkit-app-region'] = 'drag';
                    inputEl.style['-webkit-app-region'] = 'no-drag';
                    if (modeEl) {
                        modeEl.style['-webkit-app-region'] = 'no-drag';
                    }
                }

                return {
                    width: overlayWidth,
                    height: overlayHeight,
                    top: top,
                    left: overlayLeft
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