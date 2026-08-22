const BaseAISupplier = require('./BaseAISupplier');

const COPILOT_URL = 'https://copilot.microsoft.com/';
const COLOR_THEME_COOKIE_NAME = 'colorTheme';
const COPILOT_NAME = 'Copilot';

class CopilotSupplier extends BaseAISupplier {
    constructor() {
        super('microsoft_copilot', COPILOT_NAME, COPILOT_URL);
    }

    checkRealChatURL(currentURL) {
        const copilotChatRegex = /copilot\.microsoft\.com\/chats\/[a-zA-Z0-9]{20}/;
        return copilotChatRegex.test(currentURL);
    }

    async isRealChatReady(webContents) {
        return await webContents.executeJavaScript(`
                !!(document.querySelector('div[data-content="conversation"]') && document.querySelector('div[data-content="user-message"]') && document.querySelector('div[data-content="ai-message"]'))
                `);
    }

    getQuickLauncherJS() {
        return `
            (function() {
                const inputEl = document.querySelector('div[data-testid="composer-background"]')?.querySelector('div');
                if (!inputEl) return null;

                document.documentElement.style['-webkit-app-region'] = 'drag';
                inputEl.style['-webkit-app-region'] = 'no-drag';
                const inputDomRect = inputEl.getBoundingClientRect();
                let overlayEl = document.getElementById('popoverPortal')?.querySelector('div');
                if (!overlayEl) {
                    overlayEl = document.querySelector('.w-expanded-composer:not(:has(textarea))')?.querySelector('div');
                    if (overlayEl) {
                        document.documentElement.style['-webkit-app-region'] = 'drag';
                        inputEl.style['-webkit-app-region'] = 'no-drag';
                        overlayEl.style['-webkit-app-region'] = 'no-drag';
                    }
                } else {
                    document.documentElement.style['-webkit-app-region'] = 'no-drag';
                }

                let overlayHeight = 0; 
                let top = inputDomRect.top;
                
                if (overlayEl) {
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
        return ['colorTheme'];
    }

    async applyViewTheme({ tabView, theme, currentTheme, setLocalStorage, removeLocalStorage }) {
        const currentDataTheme = await tabView.webContents.executeJavaScript("document.querySelector('[data-theme]')?.getAttribute('data-theme');");
        if (!(currentDataTheme === 'dark' || currentDataTheme === 'light')) {
            return false;
        }

        const isDark = theme === 'dark';
        const targetTheme = isDark ? 'dark' : 'light'
        const cookiesService = tabView.webContents.session.cookies;

        if (this._cookiesThemeListener) {
            cookiesService.removeListener('changed', this._cookiesThemeListener);
        }

        try {
            const hasElements = await tabView.webContents.executeJavaScript(`document.querySelectorAll('button[aria-label="Mico"],button[aria-label="Sage"],button[aria-label="Pax"]').length > 2`);

            if (hasElements) {
                await tabView.webContents.executeJavaScript(`
                (function() {
                    const getThemeBtn = () => {
                        const btns = document.querySelectorAll('button[aria-label="Mico"],button[aria-label="Sage"],button[aria-label="Pax"]')[2].closest('div[tabindex="-1"]').querySelectorAll('div button:last-of-type');
                        return btns[btns.length - 1];                               
                    };
                    
                    const getDarkThemSelector = () => { 
                        return document.querySelector('button:has(path[d="M20.0258 17.0014C17.2639 21.7851 11.1471 23.4241 6.3634 20.6622C5.06068 19.9101 3.964 18.8926 3.12872 17.6797C2.84945 17.2741 3.0301 16.7141 3.49369 16.5482C7.26112 15.1997 9.27892 13.6372 10.4498 11.4021C11.6825 9.04908 12.001 6.47162 11.1387 2.93862C11.0195 2.45008 11.4053 1.98492 11.9075 2.01186C13.4645 2.09539 14.9856 2.54263 16.3649 3.33903C21.1486 6.10088 22.7876 12.2177 20.0258 17.0014ZM11.7785 12.0981C10.5272 14.4867 8.46706 16.1972 4.96104 17.597C5.5693 18.2929 6.29275 18.8894 7.1134 19.3632C11.1796 21.7108 16.3791 20.3176 18.7267 16.2514C21.0744 12.1852 19.6812 6.98571 15.6149 4.63807C14.7379 4.1317 13.7951 3.79168 12.8228 3.62253C13.4699 7.00652 13.0525 9.66622 11.7785 12.0981Z"])');
                    };

                    const btn = getThemeBtn();
                    let darkThemSelector = getDarkThemSelector();
                    const noSelectors = !darkThemSelector;
                    if (noSelectors) {
                        btn.click();                        
                    }

                    setTimeout(() => {
                        darkThemSelector = getDarkThemSelector();

                        if (${isDark} && darkThemSelector.getAttribute('aria-pressed') === 'false') {
                            darkThemSelector.click();
                        } else if (${!isDark} && darkThemSelector.getAttribute('aria-pressed') === 'true') {
                            darkThemSelector.previousElementSibling.click();
                        }

                        if (noSelectors) {
                            btn.click();                        
                        }
                    }, 150); 
                })();
                `);
            } else {
                await tabView.webContents.executeJavaScript(`document.querySelectorAll('[data-theme]').forEach(el => el.setAttribute('data-theme', '${targetTheme}'))`);

                if (isDark) {
                    await cookiesService.set({
                        url: COPILOT_URL,
                        name: COLOR_THEME_COOKIE_NAME,
                        value: targetTheme
                    });
                } else {
                    await cookiesService.remove(COPILOT_URL, COLOR_THEME_COOKIE_NAME);
                }

                await tabView.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('copilot-color-theme-changed'));`);
            }

            this._cookiesThemeListener = async (event, cookie, cause, removed) => {
                if (cookie.name === COLOR_THEME_COOKIE_NAME) {
                    if (cause === 'expired-overwrite' && removed) {
                        cookie.value = '';
                    }
                    await tabView.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('cookie-color-theme-changed', { detail: { theme: '${cookie.value}' } }));`);
                }
            };

            cookiesService.on('changed', this._cookiesThemeListener);

            return true;
        } catch (error) { }

        return false;
    }

    async getExportHtmlContent(webContents, type) {
        const jsCode = `(async function() { try { 
            const turns = []; 
            const conversation = document.querySelector('div[data-content="conversation"]');
            const turnItems = conversation.querySelectorAll('div[id*="-user-message"], div[data-content="ai-message"]'); 

            let promptText = '';
            let responseText = '';
            (turnItems ?? []).forEach((turnItem) => { 
                const userMsg = turnItem.querySelector('div[data-content="user-message"]');
                 if (userMsg) {
                    promptText = userMsg.innerText;
                    responseText = '';
                } else {
                    responseText = turnItem.querySelector('div[data-testid="ai-message-body"]').innerHTML;
                }

                if (promptText && responseText) { 
                    turns.push({ promptText: promptText, responseText: responseText }); 
                    promptText = '';
                    responseText = '';
                } 
            });

            const url = new URL(window.location.href);
            const chatId = url.pathname.split('/').pop();

            const getTitle = () => {
                const titleButton = document.getElementById('conversation-options-' + chatId);
                if (titleButton) {
                    return titleButton.parentElement.parentElement.innerText;
                }

                return '';
            };

            let title = document.title || "AI CHAT LOG";
            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            const sideBar = document.querySelector('button[aria-controls="sidebar-container"]');
            const clickSideBar = sideBar && sideBar.getAttribute('aria-expanded') === 'false'
            if (clickSideBar) {
                sideBar.click();
                await sleep(150 * 3)
                title = getTitle() || title; 
                sideBar.click();
            } else {
                title = getTitle() || title;
            }
                
            const chatData = { title: title + ' - ${COPILOT_NAME}', url: document.location.href, dialogues: turns }; 
            
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

        const title = String(chatData.title ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const htmlContent = '<!DOCTYPE html><html lang="und"><head><meta charset="UTF-8"><title>' + title + '</title>' +
            '<style>@page { size: A4; margin: 0; } body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; margin: 0; padding: 50px; color: #1e293b; background-color: #ffffff; line-height: 1.6; font-size: 15px;} .file-banner { font-size: 12px; font-weight: 600; color: #64748b; padding-bottom: 12px; margin-bottom: 35px; border-bottom: 1px solid #e2e8f0; letter-spacing: 1px; text-transform: uppercase;} pre { font-family: "Consolas", "Fira Code", "Courier New", monospace; font-size: 13px; line-height: 1.5; color: #0f172a; white-space: pre-wrap; word-break: break-all; margin: 0; } a .export-title { font-size: 24px; font-weight: 700; color: #0f172a; margin-bottom: 30px; } .chat-section { margin-bottom: 25px; border-radius: 8px; padding: 20px; } .prompt-section { background-color: #f8fafc; border-left: 4px solid #64748b; } .response-section { background-color: #ffffff; border-left: 4px solid #3b82f6; border: 1px solid #f1f5f9; } .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; } .prompt-section .section-label { color: #64748b; } .response-section .section-label { color: #3b82f6; } .content { color: #334155; font-size: 15px; white-space: pre-wrap; } .code-block-wrapper, pre { margin: 8px; padding: 16px; display: inline-flex; align-items: center; vertical-align: middle; background-color: #f1f5f9; border-radius: 4px; border: 1px solid #e2e8f0; } .code-block-wrapper pre, pre code { display: inline; font-size: 0.9em; font-family: "Consolas", "Fira Code", "Courier New", monospace; color: #0f172a; white-space: pre; word-break: normal; margin: 0; white-space: pre-wrap; word-wrap: break-word; word-break: break-all; } table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; } th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; color: #334155; } th { background-color: #f8fafc; color: #0f172a; font-weight: 600; } tr:nth-child(even) { background-color: #fdfdfd; } img + div {padding-bottom: 0px !important; display: none} </style></head>' +
            '<body><div class="file-banner">AI CHAT LOG</div><a href="' + chatData.url + '"><h1 class="export-title">' + title + '</h1></a>' + dialoguesHtml + '</body></html>';

        return htmlContent;
    }
}

module.exports = CopilotSupplier;
