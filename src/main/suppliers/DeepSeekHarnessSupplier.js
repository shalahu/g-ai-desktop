const { net } = require('electron');
const BaseAISupplier = require('./BaseAISupplier');
const { APP_USER_AGENT } = require('../constants');
const { getConfig } = require('../config');
const DSH_NAME = 'DeepSeek Harness';

let dshURL = 'http://127.0.0.1:3080';

class DeepSeekHarnessSupplier extends BaseAISupplier {
    constructor() {
        const dshWebURL = getConfig('dshWebURL');
        if (dshWebURL) {
            dshURL = dshWebURL;
        }

        super('deep_seek_harness', DSH_NAME, dshURL);
    }

    checkRealChatURL(currentURL) {
        return false;
    }

    async isRealChatReady(webContents) {
        return await webContents.executeJavaScript(`
                !!(document.querySelector('div[data-chat-flow-kind="user"]') && document.querySelector('div[data-chat-flow-kind="assistant-step"]'))
                `);
    }

    getQuickLauncherJS() {
        return `
            (async function() {
                const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

                if (!document.querySelector('button[class*="_workspace"]') && document.title.includes('—')) {
                    document.querySelector('button[class*="_newSession"]')?.click();
                }

                await sleep(150);

                const inputEl = document.querySelector('div[class*="_root"][class*="_hero"]');
                if (!inputEl) return null;
                const modeEl = document.querySelector('div[class*="_heroWorkspaceRow"]');
                if (!modeEl) return null;

                document.documentElement.style['-webkit-app-region'] = 'drag';
                inputEl.style['-webkit-app-region'] = 'no-drag';
                modeEl.style['-webkit-app-region'] = 'no-drag';

                const modeDomRect = modeEl.getBoundingClientRect();
                const inputDomRect = inputEl.getBoundingClientRect();
                const inputDomRectHeight = inputDomRect.height + (modeDomRect ? modeDomRect.height : 0); 

                const overlayEl = document.querySelector('div[class*="_menu"],[role="menu"],[aria-label^="/"]');

                let overlayHeight = inputDomRectHeight; 
                let top = modeDomRect.top;

                if (overlayEl) {
                    document.documentElement.style['-webkit-app-region'] = 'no-drag';
                    const overlayDomRect = overlayEl.getBoundingClientRect();
                    if (overlayDomRect.y + overlayDomRect.height > modeDomRect.y + inputDomRectHeight) {
                        overlayHeight = modeDomRect.height + overlayDomRect.height;
                    }
                    if (overlayDomRect.y < modeDomRect.y) {
                        top = overlayDomRect.top;
                        overlayHeight = inputDomRectHeight + (modeDomRect.y - overlayDomRect.y);
                    }
                } else {
                    document.documentElement.style['-webkit-app-region'] = 'drag';
                    inputEl.style['-webkit-app-region'] = 'no-drag';
                    modeEl.style['-webkit-app-region'] = 'no-drag';
                }

                function changed() {
                    window.dispatchEvent(new CustomEvent('quick-launcher-changed', {
                            detail: ${JSON.stringify(dshURL)} 
                        }));  
                    
                    setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('quick-launcher-changed', {
                            detail: 'Escape'
                        }));                  
                    }, 0);
                }

                function handleSendMsgBtnClick() {
                    changed();
                }

                function handleKeyDown(e) {
                    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                        changed();
                    }
                }

                const sendMsgBtn = document.querySelector('button[class*="_primary"]');
                if (sendMsgBtn) {
                    sendMsgBtn.removeEventListener('click', handleSendMsgBtnClick);
                    sendMsgBtn.addEventListener('click', handleSendMsgBtnClick);
                }
                
                const textarea = document.querySelector('[data-composer-card] textarea');
                if (textarea && textarea.value.trim() !== '') {
                    textarea.removeEventListener('keydown', handleKeyDown);
                    textarea.addEventListener('keydown', handleKeyDown);
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

    async postJsonToURL(tabView, url, body) {
        try {
            if (url) {
                const rawCookies = await tabView.webContents.session.cookies.get({ url: url.href });
                const cookieString = rawCookies
                    .filter(c => c && c.name && c.value)
                    .map(c => `${c.name}=${c.value}`)
                    .join('; ');

                const headers = {
                    'User-Agent': APP_USER_AGENT,
                    'Accept': '*/*',
                    'Content-Type': 'application/json'
                };

                if (cookieString) {
                    headers['Cookie'] = cookieString;
                }

                const response = await net.fetch(url.href, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body)
                });

                return await response.json();
            }
        } catch (netErr) { }

        return null;
    }

    async applyViewTheme({ tabView, theme, currentTheme, setLocalStorage, removeLocalStorage }) {
        if (!(this.matchesUrl(tabView.webContents.getURL()))) {
            return false;
        }

        const json = await this.postJsonToURL(tabView, new URL(`${dshURL}/api/settings.describe`), {
            type: "client-request",
            rpcId: crypto.randomUUID(),
            method: "settings.describe",
            payload: {}
        });

        if (!json) return false;

        const expectedRevision = json.result?.value?.namespaces?.find(item => item.ns === "ui-theme")?.revision;

        if (!expectedRevision) return false;

        await this.postJsonToURL(tabView, new URL(`${dshURL}/api/settings.mutate`), {
            type: "client-request",
            rpcId: crypto.randomUUID(),
            method: "settings.mutate",
            payload: {
                ns: "ui-theme",
                ops: [{
                    op: "set",
                    path: ["preference"],
                    value: theme
                }
                ],
                expectedRevision: expectedRevision
            }
        });

        return true;
    }

    async getExportHtmlContent(webContents, type) {
        const executionResult = await webContents.executeJavaScript(`
            new Promise((resolve) => {
                setTimeout(() => {
                    resolve({
                        html: document.documentElement.outerHTML,
                        title: document.title
                    });
                }, 150); 
            });
        `);

        const htmlContent = executionResult.html;
        const title = executionResult.title;

        const forcedPrintStyles = `
            <style>
                div[class*="_frame"] { 
                    display: inherit; 
                }
                .export-title,div[class*="_sidebarCol"],div[data-slot="conversation.session.header"],div[data-composer-seat],div[class*="_detailsCol"] { 
                    display: none !important;
                }
            </style>
            <h1 class="export-title">${String(title ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))} - ${DSH_NAME}</h1>
            `;

        return htmlContent + forcedPrintStyles;
    }
}

module.exports = DeepSeekHarnessSupplier;