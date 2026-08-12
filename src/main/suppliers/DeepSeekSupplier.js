const { net } = require('electron');
const BaseAISupplier = require('./BaseAISupplier');

class DeepSeekSupplier extends BaseAISupplier {
    constructor() {
        super('deep_seek_chat', 'DeepSeek', 'https://chat.deepseek.com/');
    }

    checkRealChatURL(currentURL) {
        const dsChatRegex = /chat\.deepseek\.com\/a\/chat\/s\/([0-9a-fA-F]{16}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;
        return dsChatRegex.test(currentURL);
    }

    async isRealChatReady(webContents) {
        return await webContents.executeJavaScript(`
                !!(document.querySelector('.ds-virtual-list-visible-items') && document.querySelector('div[data-virtual-list-item-key]'))
                `);
    }

    getQuickLauncherJS() {
        return `
            (function() {
                const modeEl = document.querySelector('div[role="radiogroup"]').parentElement;
                if (!modeEl) return null;
                const inputEl = modeEl.nextElementSibling;
                if (!inputEl) return null;

                modeEl.parentElement.style['-webkit-app-region'] = 'drag';
                modeEl.style['-webkit-app-region'] = 'no-drag';
                inputEl.style['-webkit-app-region'] = 'no-drag';

                const modeDomRect = modeEl.getBoundingClientRect();
                const inputDomRect = inputEl.getBoundingClientRect();
                const inputDomRectHeight = inputDomRect.height + inputDomRect.y - modeDomRect.height - modeDomRect.y; 

                return {
                    width: inputDomRect.width,
                    height: inputDomRectHeight + modeDomRect.height,
                    top: modeDomRect.top,
                    left: inputDomRect.left
                };
            })();
        `;
    }

    getLocalStorageThemeBridgeKeys() {
        return ['__appKit_@deepseek/chat_themePreference'];
    }

    handleLocalStorageThemeBridge({ key, value, toggleTheme }) {
        if (key !== '__appKit_@deepseek/chat_themePreference') return undefined;

        toggleTheme(value.includes('system') ? 'system' : (value.includes('dark') ? 'dark' : 'light'));

        return 'init-theme-selector';
    }

    async applyViewTheme({ tabView, theme, currentTheme, setLocalStorage, removeLocalStorage }) {
        const bodyClassList = await tabView.webContents.executeJavaScript("Array.from(document.body.classList);");

        if (!(bodyClassList.includes('dark') || bodyClassList.includes('light'))) {
            return false;
        }

        const hasElements = await tabView.webContents.executeJavaScript(`!!(document.querySelector('.ds-modal-wrapper')?.querySelectorAll('div.ds-button--outlined[role="button"]'))`);
        if (hasElements) {
            const jsCode = `(() => { 
                        const elements = document.querySelector('.ds-modal-wrapper').querySelectorAll('div.ds-button--outlined[role="button"]');
                        const themes = ['light', 'dark', 'system'];
                        for (let i = 0; i < themes.length; i++) {
                            if (themes[i] === '${theme}') {
                                elements[i].click();
                                break;
                            }
                        }
                    })();`;

            tabView.webContents.executeJavaScript(jsCode);
        } else {
            if (currentTheme === 'dark') {
                tabView.webContents.executeJavaScript("document.body.classList.replace('light', 'dark');");
                tabView.webContents.executeJavaScript("document.body.setAttribute('data-ds-dark-theme', 'dark');");
                tabView.webContents.executeJavaScript(`document.documentElement.setAttribute('data-immersive-translate-page-theme', 'dark');`);
            } else {
                tabView.webContents.executeJavaScript("document.body.classList.replace('dark', 'light');");
                tabView.webContents.executeJavaScript("document.body.removeAttribute('data-ds-dark-theme');");
                tabView.webContents.executeJavaScript(`document.documentElement.setAttribute('data-immersive-translate-page-theme', 'light');`);
            }

            setLocalStorage(tabView, '__appKit_@deepseek/chat_themePreference', `{"value":"${theme}","__version":"0"}`);
        }

        return true;
    }

    async getExportHtmlContent(webContents, type) {
        const executionResult = await webContents.executeJavaScript(`
            new Promise((resolve) => {
                window.dispatchEvent(new Event('beforeprint'));

                setTimeout(() => {
                    const mainLinkElement = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
                .find(el => el.href && el.href.includes('/main.'));

                const dynamicCssUrl = mainLinkElement ? mainLinkElement.href : "";
                         resolve({
                    html: document.documentElement.innerHTML,
                    cssUrl: dynamicCssUrl,
                    title: document.title,
                    headerCssName: document.querySelector('.the-header').parentElement.classList.value
                });
                    }, 150); 
            });
        `);

        const htmlContent = executionResult.html;
        const dynamicCssUrl = executionResult.cssUrl;
        const title = executionResult.title;
        const headerCssName = executionResult.headerCssName;

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
                html, body, #app, #root, [class*="container"], [class*="wrapper"], main, section {
                    height: auto !important;
                    max-height: none !important;
                    overflow: visible !important;
                    position: static !important;
                    display: block !important;
                    background: #fff !important;
                }
                .export-title {
                    display: none !important;
                }
                .${headerCssName} {display: flex !important;}
                ${remoteCssText}
                ${extractedPrintStyles}
            </style>
            <h1 class="export-title">${title}</h1>
            `;

        return htmlContent + forcedPrintStyles;
    }
}

module.exports = DeepSeekSupplier;
