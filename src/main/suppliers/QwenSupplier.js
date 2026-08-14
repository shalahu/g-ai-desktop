const { net } = require('electron');
const BaseAISupplier = require('./BaseAISupplier');
const { APP_USER_AGENT } = require('../constants');
const QWEN_URL = 'https://chat.qwen.ai/';
const QWEN_NAME = 'Qwen';
const QWEN_THEME_COOKIE_NAME = 'qwen-theme';

class QwenSupplier extends BaseAISupplier {
    constructor() {
        super('alibaba_qwen', QWEN_NAME, QWEN_URL);
    }

    checkRealChatURL(currentURL) {
        const qwenChatRegex = /chat\.qwen\.ai\/c\/([0-9a-fA-F]{8}|[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;
        return qwenChatRegex.test(currentURL);
    }

    async isRealChatReady(webContents) {
        return await webContents.executeJavaScript(`
                !!(document.querySelector('.chat-messages') && document.querySelector('.qwen-chat-message'))
                `);
    }

    getQuickLauncherJS() {
        return `
            (function() {
                const inputEl = document.querySelector('.message-input-container');
                if (!inputEl) return null;

                document.documentElement.style['-webkit-app-region'] = 'drag';
                inputEl.style['-webkit-app-region'] = 'no-drag';

                const inputDomRect = inputEl.getBoundingClientRect();
                const inputDomRectHeight = inputDomRect.height;
                const inputDomRectWidth = inputDomRect.width; 

                let overlayEl = document.querySelector('.ant-dropdown');
                if (!overlayEl) {
                    overlayEl = document.querySelector('.ant-select-dropdown');
                    if (overlayEl && overlayEl.getBoundingClientRect().height === 0) {
                        overlayEl = null;
                    }
                }

                let overlayHeight = inputDomRectHeight;
                let overlayWidth = inputDomRectWidth; 
                let top = inputDomRect.top;

                if (overlayEl) {
                    document.documentElement.style['-webkit-app-region'] = 'no-drag';
                    const overlayDomRect = overlayEl.getBoundingClientRect();
                    if (overlayDomRect.y + overlayDomRect.height > inputDomRect.y + inputDomRectHeight) {
                        overlayHeight = inputDomRect.height + overlayDomRect.height - (inputDomRect.y + inputDomRect.height - overlayDomRect.y);
                    }
                    if (overlayDomRect.x + overlayDomRect.width > inputDomRect.x + inputDomRectWidth) {
                        overlayWidth = inputDomRect.width + overlayDomRect.width - (inputDomRect.x + inputDomRect.width - overlayDomRect.x);
                    }
                } else {
                    document.documentElement.style['-webkit-app-region'] = 'drag';
                    inputEl.style['-webkit-app-region'] = 'no-drag';
                }

                return {
                    width: overlayWidth,
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
        const currentURL = tabView.webContents.getURL();
        if (!(this.matchesUrl(currentURL))) {
            return false;
        }

        const cookiesService = tabView.webContents.session.cookies;
        if (this._cookiesThemeListener) {
            cookiesService.removeListener('changed', this._cookiesThemeListener);
        }

        if (currentURL === 'https://chat.qwen.ai/settings/general') {
            await tabView.webContents.executeJavaScript(`
                (function() {
                    const elements = document.querySelectorAll('input[class="ant-segmented-item-input"]');
                    const themes = ['system', 'light', 'dark'];
                    for (let i = 0; i < themes.length; i++) {
                        if (themes[i] === '${theme}') {
                            elements[i]?.click();
                            break;
                        }
                    }
                })();
                `);
        } else {
            if (theme === 'dark') {
                tabView.webContents.executeJavaScript("document.documentElement.classList.replace('light', 'dark');");
            } else {
                tabView.webContents.executeJavaScript("document.documentElement.classList.replace('dark', 'light');");
            }

            setLocalStorage(tabView, 'theme', theme);

            await tabView.webContents.session.cookies.set({
                url: QWEN_URL,
                name: QWEN_THEME_COOKIE_NAME,
                value: theme
            });

            await this.postJsonToURL(tabView, new URL('https://chat.qwen.ai/api/v2/users/user/settings/update'), {
                ui: { theme: theme }
            });

            await tabView.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('qwen-theme-changed'));`);
        }

        this._cookiesThemeListener = async (event, cookie, cause, removed) => {
            if (cookie.name === QWEN_THEME_COOKIE_NAME) {
                let value = cookie.value;
                if (value === 'light') {
                    value = await tabView.webContents.executeJavaScript("localStorage.getItem('theme');");
                }
                await tabView.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('cookie-qwen-theme-changed', { detail: { theme: ${JSON.stringify(value)} } }));`);
            }
        };

        cookiesService.on('changed', this._cookiesThemeListener);

        return true;
    }

    async getExportHtmlContent(webContents, type) {
        const jsCode = `(async function() { try { 
            const turns = []; 
            const turnItems = document.querySelectorAll('.qwen-chat-message'); 

            let promptText = '';
            let responseText = '';
            (turnItems ?? []).forEach((turnItem) => { 
                const userMsg = Array.from(turnItem.classList).includes('qwen-chat-message-user');
                 if (userMsg) {
                    promptText = turnItem.innerText;
                    responseText = '';
                } else {
                    responseText = turnItem.innerHTML;
                }

                if (promptText && responseText) { 
                    turns.push({ promptText: promptText, responseText: responseText }); 
                    promptText = '';
                    responseText = '';
                } 
            });

            let title = document.querySelector('.chat-item-drag-active').textContent || "AI CHAT LOG";

                
            const chatData = { title: title + ' - ${QWEN_NAME}', url: document.location.href, dialogues: turns }; 
            
            return chatData;
        } catch (e) {} })();`;

        const chatData = await webContents.executeJavaScript(jsCode);

        let dialoguesHtml = "";
        (chatData?.dialogues ?? []).forEach((round, index) => {
            dialoguesHtml += '<div class="chat-section prompt-section">' +
                '<div class="section-label">User Prompt #' + (index + 1) + '</div>' +
                '<div class="content">' + round.promptText + '</div>' +
                '</div>' +
                '<div class="chat-section response-section">' +
                '<div class="section-label">AI Response #' + (index + 1) + '</div>' +
                '<div class="content">' + round.responseText;

            dialoguesHtml += '</div></div>';
        });

        const htmlContent = '<!DOCTYPE html><html lang="und"><head><meta charset="UTF-8"><title>' + chatData.title + '</title>' +
            '<style>@page { size: A4; margin: 0; } body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; margin: 0; padding: 50px; color: #1e293b; background-color: #ffffff; line-height: 1.6; font-size: 15px;} .file-banner { font-size: 12px; font-weight: 600; color: #64748b; padding-bottom: 12px; margin-bottom: 35px; border-bottom: 1px solid #e2e8f0; letter-spacing: 1px; text-transform: uppercase;} pre { font-family: "Consolas", "Fira Code", "Courier New", monospace; font-size: 13px; line-height: 1.5; color: #0f172a; white-space: pre-wrap; word-break: break-all; margin: 0; } a .export-title { font-size: 24px; font-weight: 700; color: #0f172a; margin-bottom: 30px; } .chat-section { margin-bottom: 25px; border-radius: 8px; padding: 20px; } .prompt-section { background-color: #f8fafc; border-left: 4px solid #64748b; } .response-section { background-color: #ffffff; border-left: 4px solid #3b82f6; border: 1px solid #f1f5f9; } .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; } .prompt-section .section-label { color: #64748b; } .response-section .section-label { color: #3b82f6; } .content { color: #334155; font-size: 15px; white-space: pre-wrap; } .code-block-wrapper, pre { margin: 8px; padding: 16px; display: inline-flex; align-items: center; vertical-align: middle; background-color: #f1f5f9; border-radius: 4px; border: 1px solid #e2e8f0; } .code-block-wrapper pre, pre code { display: inline; font-size: 0.9em; font-family: "Consolas", "Fira Code", "Courier New", monospace; color: #0f172a; white-space: pre; word-break: normal; margin: 0; white-space: pre-wrap; word-wrap: break-word; word-break: break-all; } table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; } th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; color: #334155; } th { background-color: #f8fafc; color: #0f172a; font-weight: 600; } tr:nth-child(even) { background-color: #fdfdfd; } img + div {padding-bottom: 0px !important; display: none} .message-hoc-container {display: none}</style></head>' +
            '<body><div class="file-banner">AI CHAT LOG</div><a href="' + chatData.url + '"><h1 class="export-title">' + chatData.title + '</h1></a>' + dialoguesHtml + '</body></html>';

        return htmlContent;
    }
}

module.exports = QwenSupplier;