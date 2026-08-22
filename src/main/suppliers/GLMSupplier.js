const BaseAISupplier = require('./BaseAISupplier');
const { APP_USER_AGENT } = require('../constants');
const GLM_URL = 'https://chat.z.ai/';
const GLM_NAME = 'GLM by Z.ai';

class GLMSupplier extends BaseAISupplier {
    constructor() {
        super('z_ai_glm', GLM_NAME, GLM_URL);
    }

    checkRealChatURL(currentURL) {
        const qwenChatRegex = /chat\.z\.ai\/c\/([0-9a-fA-F]{8}|[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;
        return qwenChatRegex.test(currentURL);
    }

    async isRealChatReady(webContents) {
        return await webContents.executeJavaScript(`
                !!(document.getElementById('messages-container') && document.querySelector('.chat-user') && document.querySelector('.chat-assistant'))
                `);
    }

    getQuickLauncherJS() {
        return `
            (function() {
                const inputEl = document.querySelector('.messageInputContainer');
                if (!inputEl) return null;

                document.documentElement.style['-webkit-app-region'] = 'drag';
                inputEl.style['-webkit-app-region'] = 'no-drag';

                const inputDomRect = inputEl.getBoundingClientRect();
                const inputDomRectHeight = inputDomRect.height;
                const inputDomRectWidth = inputDomRect.width; 

                const overlayEl = document.querySelector('div[data-bits-floating-content-wrapper]');
                if (overlayEl) {
                    overlayEl.style['-webkit-app-region'] = 'no-drag';
                }

                let overlayHeight = inputDomRectHeight;
                let overlayWidth = inputDomRectWidth; 
                let top = inputDomRect.top;
                let left = inputDomRect.left;

                if (overlayEl) {
                    document.documentElement.style['-webkit-app-region'] = 'no-drag';
                    const overlayDomRect = overlayEl.getBoundingClientRect();
                    if (overlayDomRect.y + overlayDomRect.height > inputDomRect.y + inputDomRectHeight) {
                        overlayHeight = inputDomRect.height + overlayDomRect.height - (inputDomRect.y + inputDomRect.height - overlayDomRect.y);
                    }
                    if (overlayDomRect.y < inputDomRect.y) {
                        top = overlayDomRect.top;
                        overlayHeight = inputDomRect.y - overlayDomRect.y + overlayDomRect.height;
                    }
                    if (overlayDomRect.x + overlayDomRect.width > inputDomRect.x + inputDomRectWidth) {
                        overlayWidth = inputDomRect.width + overlayDomRect.width - (inputDomRect.x + inputDomRect.width - overlayDomRect.x);
                    }
                    if (overlayDomRect.x < inputDomRect.x) {
                        left = overlayDomRect.left;
                        overlayWidth = inputDomRect.x - overlayDomRect.x + inputDomRect.width;
                    }   
                } else {
                    document.documentElement.style['-webkit-app-region'] = 'drag';
                    inputEl.style['-webkit-app-region'] = 'no-drag';
                }

                return {
                    width: overlayWidth,
                    height: overlayHeight,
                    top: top,
                    left: left
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
        const currentURL = tabView.webContents.getURL();
        if (!(this.matchesUrl(currentURL))) {
            return false;
        }

        if (currentURL === 'https://chat.z.ai/settings/general') {
            await tabView.webContents.executeJavaScript(`
                (function() {
                    const btn = document.querySelector('button[aria-haspopup="listbox"]');
                    if (!btn) return;
                    const state = btn.getAttribute('data-state');
                    if (state === 'closed') {
                        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
                    }

                    setTimeout(() => {
                        const elements = document.querySelectorAll('div[data-value="system"],[data-value="light"],[data-value="dark"]');
                        const themes = ['system', 'light', 'dark'];
                        for (let i = 0; i < themes.length; i++) {
                            if (themes[i] === '${theme}') {
                                elements[i]?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
                                break;
                            }
                        }
                    }, 150);                    
                })();
                `);
        } else {
            if (theme === 'dark') {
                tabView.webContents.executeJavaScript("document.documentElement.classList.replace('light', 'dark');");
            } else {
                tabView.webContents.executeJavaScript("document.documentElement.classList.replace('dark', 'light');");
            }

            setLocalStorage(tabView, 'theme', theme);
        }

        return true;
    }

    async getExportHtmlContent(webContents, type) {
        const jsCode = `(async function() { try { 
            const turns = []; 
            const turnItems = document.querySelectorAll('.chat-user, .chat-assistant'); 

            let promptText = '';
            let responseText = '';
            (turnItems ?? []).forEach((turnItem) => { 
                const userMsg = Array.from(turnItem.classList).includes('chat-user');
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

            const getTitle = () => {
                const titleButton = document.querySelector('button[data-selected="true"]');
                if (titleButton) {
                    return titleButton.innerText;
                }

                return '';
            };

            let title = document.title || "AI CHAT LOG";
            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            const sideBar = document.querySelector('.logoIcon');
            const clickSideBar = sideBar;
            if (clickSideBar) {
                sideBar.click();
                await sleep(150 * 3)
                title = getTitle() || title; 
                document.querySelector('button[class*="cursor-pointer"')?.click();
            } else {
                title = getTitle() || title;
            }
                
            const chatData = { title: title + ' - ${GLM_NAME}', url: document.location.href, dialogues: turns }; 
            
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
            '<style>@page { size: A4; margin: 0; } body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; margin: 0; padding: 50px; color: #1e293b; background-color: #ffffff; line-height: 1.6; font-size: 15px;} .file-banner { font-size: 12px; font-weight: 600; color: #64748b; padding-bottom: 12px; margin-bottom: 35px; border-bottom: 1px solid #e2e8f0; letter-spacing: 1px; text-transform: uppercase;} pre { font-family: "Consolas", "Fira Code", "Courier New", monospace; font-size: 13px; line-height: 1.5; color: #0f172a; white-space: pre-wrap; word-break: break-all; margin: 0; } a .export-title { font-size: 24px; font-weight: 700; color: #0f172a; margin-bottom: 30px; } .chat-section { margin-bottom: 25px; border-radius: 8px; padding: 20px; } .prompt-section { background-color: #f8fafc; border-left: 4px solid #64748b; } .response-section { background-color: #ffffff; border-left: 4px solid #3b82f6; border: 1px solid #f1f5f9; } .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; } .prompt-section .section-label { color: #64748b; } .response-section .section-label { color: #3b82f6; } .content { color: #334155; font-size: 15px; white-space: pre-wrap; } .code-block-wrapper, pre, div[class*="language-"]>div { margin: 8px; padding: 16px; display: inline-flex; align-items: center; vertical-align: middle; background-color: #f1f5f9; border-radius: 4px; border: 1px solid #e2e8f0; } .code-block-wrapper pre, pre code, div[class*="language-"] { display: inline; font-size: 0.9em; font-family: "Consolas", "Fira Code", "Courier New", monospace; color: #0f172a; white-space: pre; word-break: normal; margin: 0; white-space: pre-wrap; word-wrap: break-word; word-break: break-all; } table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; } th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; color: #334155; } th { background-color: #f8fafc; color: #0f172a; font-weight: 600; } tr:nth-child(even) { background-color: #fdfdfd; } img + div {padding-bottom: 0px !important; display: none} .thinking-chain-container,div[aria-hidden="true"] {display: none}</style></head>' +
            '<body><div class="file-banner">AI CHAT LOG</div><a href="' + chatData.url + '"><h1 class="export-title">' + title + '</h1></a>' + dialoguesHtml + '</body></html>';

        return htmlContent;
    }
}

module.exports = GLMSupplier;