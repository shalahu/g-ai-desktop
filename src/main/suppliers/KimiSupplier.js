const BaseAISupplier = require('./BaseAISupplier');

class KimiSupplier extends BaseAISupplier {
    constructor() {
        super('moonshot_ai_kimi', 'Kimi', 'https://www.kimi.com/');
    }

    checkRealChatURL(currentURL) {
        const kimiChatRegex = /www\.kimi\.com\/chat\/([0-9a-fA-F]{16}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;
        return kimiChatRegex.test(currentURL);
    }

    async isRealChatReady(webContents) {
        return await webContents.executeJavaScript(`
                !!(document.querySelector('.chat-content-list') && document.querySelector('.chat-content-item'))
                `);
    }

    getQuickLauncherJS() {
        return `
            (function() {
                const inputEl = document.querySelector('.chat-editor');
                if (!inputEl) return null;
                const optionsEl = inputEl.nextElementSibling;
                if (!optionsEl) return null;
                const publisherEl = optionsEl.nextElementSibling;
                if (!publisherEl) return null;

                inputEl.parentElement.parentElement.parentElement.parentElement.style['-webkit-app-region'] = 'drag';
                inputEl.style['-webkit-app-region'] = 'no-drag';
                optionsEl.style['-webkit-app-region'] = 'no-drag';
                publisherEl.style['-webkit-app-region'] = 'no-drag';

                const inputDomRect = inputEl.getBoundingClientRect();
                const optionsDomRect = optionsEl.getBoundingClientRect();
                const publisherDomRect = publisherEl.getBoundingClientRect();

                let inputDomRectHeight = inputDomRect.height + optionsDomRect.height + publisherDomRect.height;
                let inputDomRectTop = inputDomRect.top;

                function onPrimaryMenuHover() {
                    setTimeout(() => {
                        const popoverEls = document.querySelectorAll('.n-popover--raw');
                        const subPopoverEl = popoverEls.length > 1 ? popoverEls[popoverEls.length - 1]?.parentElement : null;
                        if (subPopoverEl) {
                            subPopoverEl.removeEventListener('mouseenter', onMenuHover);
                            subPopoverEl.addEventListener('mouseenter', onMenuHover);
                        }
                    }, 150);                        
                }

                function onMenuHover() {
                    setTimeout(() => {window.dispatchEvent(new CustomEvent('quick-launcher-changed'));}, 150);
                }

                const popoverEls = document.querySelectorAll('.n-popover--raw');
                const topPopoverEl = popoverEls.length === 1 ? popoverEls[0] : null;

                if (topPopoverEl) {
                    const primaryMenus = topPopoverEl.querySelectorAll('div[data-animation-icon-hover-target]');
                    primaryMenus.forEach((menuDom) => {
                        menuDom.addEventListener('mouseenter', onPrimaryMenuHover);
                    });
                }

                popoverEls.forEach((popEl) => {
                    const popoverEl = popEl.parentElement;
            
                    if (popoverEl.getBoundingClientRect().height > 0)
                    {
                        popoverEl.style['-webkit-app-region'] = 'no-drag';
                        const popoverDomRect = popoverEl.getBoundingClientRect();
                        if (popoverDomRect.y + popoverDomRect.height > inputDomRect.y + inputDomRectHeight) {
                            inputDomRectHeight = (popoverDomRect.y + popoverDomRect.height) - inputDomRect.y;
                        } else if (popoverDomRect.y < inputDomRect.y) {
                            inputDomRectHeight = (inputDomRect.y + inputDomRectHeight) - popoverDomRect.y;
                            inputDomRectTop = popoverDomRect.top;
                        }
                    }
                });

                return {
                    width: inputDomRect.width,
                    height: inputDomRectHeight,
                    top: inputDomRectTop,
                    left: inputDomRect.left
                };
            })();
        `;
    }

    getLocalStorageThemeBridgeKeys() {
        return ['CUSTOM_THEME'];
    }

    handleLocalStorageThemeBridge({ key, value, toggleTheme }) {
        if (key !== 'CUSTOM_THEME') return undefined;

        toggleTheme(value.includes('system') ? 'system' : (value.includes('dark') ? 'dark' : 'light'));
        return null;
    }

    async applyViewTheme({ tabView, theme, currentTheme, setLocalStorage, removeLocalStorage }) {
        const htmlClassList = await tabView.webContents.executeJavaScript("Array.from(document.documentElement.classList);");

        if (!(htmlClassList.includes('system') || htmlClassList.includes('dark') || htmlClassList.includes('light'))) {
            return false;
        }

        setLocalStorage(tabView, 'CUSTOM_THEME', `\\\"${theme}\\\"`);
        return true;
    }

    async getExportHtmlContent(webContents, type) {
        const jsCode = `(async function() { try { 
            function fetchIframeHtml(iframeSrc) {
                return new Promise((resolve) => {
                    const requestId = 'req_' + Date.now();

                    function onUiCallback(event) {
                        if (event.detail && event.detail.requestId === requestId) {
                            const htmlData = event.detail.html;
                            window.removeEventListener('net-fetch-html-response', onUiCallback);
                            resolve(htmlData);
                        }
                    }
                    window.addEventListener('net-fetch-html-response', onUiCallback);

                    const eventData = {
                        requestId: requestId,
                        src: iframeSrc
                    };

                    const customEvent = new CustomEvent('net-fetch-html-request', { detail: eventData });
                    window.dispatchEvent(customEvent);

                    setTimeout(() => {
                        window.removeEventListener('net-fetch-html-response', onUiCallback);
                        resolve(null); 
                    }, 5000);
                });
            }

            const turns = []; 
            const turnItems = document.querySelector('.chat-content-list')?.querySelectorAll('.chat-content-item'); 
            
            let promptText = '';
            let responseText = '';
            for (const turnItem of (turnItems ?? [])) { 
                const classList = Array.from(turnItem.classList);
                
                if (classList.includes('chat-content-item-user')) {
                    promptText = turnItem.querySelector('.user-content').innerHTML;
                    responseText = '';
                } else if (classList.includes('chat-content-item-assistant')) {
                    const responseEls = turnItem.querySelectorAll('.markdown-container:not(.toolcall-content-text),.toolcall-content-text,.widget-sandbox,.ipython-images-container');
                    for (const responseEl of (responseEls ?? [])) { 
                        if (Array.from(responseEl.classList).includes('toolcall-content-text')) {
                            responseText += ('<div class="code-block-wrapper">' + responseEl.innerHTML + '</div>')
                        } else if (Array.from(responseEl.classList).includes('widget-sandbox')) {
                            const iframeSrc = responseEl.querySelector('iframe').src;
                            const rawHTMLString = await fetchIframeHtml(iframeSrc);

                            const parser = new DOMParser(); 
                            const tempDoc = parser.parseFromString(rawHTMLString, 'text/html'); 
                            responseText += tempDoc.getElementById('widget-root').innerHTML;
                        } else if (Array.from(responseEl.classList).includes('ipython-images-container')) {
                            for (const img of (responseEl.querySelectorAll('img[loading="lazy"]') ?? [])) {
                                img.setAttribute('loading', 'eager');
                            }

                            responseText += responseEl.innerHTML;
                        } else {
                            responseText += responseEl.innerHTML;
                        }
                    }; 
                }

                if (promptText && responseText) { 
                    turns.push({ promptText: promptText, responseText: responseText }); 
                } 
            }; 
            
            const chatData = { title: document.title || "AI CHAT LOG", url: document.location.href, dialogues: turns }; 
            
            return chatData;
            } catch (e) {} })();`;

        const chatData = await webContents.executeJavaScript(jsCode);

        let dialoguesHtml = "";
        chatData.dialogues.forEach((round, index) => {
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
            '<style>@page { size: A4; margin: 0; } body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; margin: 0; padding: 50px; color: #1e293b; background-color: #ffffff; line-height: 1.6; font-size: 15px;} .file-banner { font-size: 12px; font-weight: 600; color: #64748b; padding-bottom: 12px; margin-bottom: 35px; border-bottom: 1px solid #e2e8f0; letter-spacing: 1px; text-transform: uppercase;} pre { font-family: "Consolas", "Fira Code", "Courier New", monospace; font-size: 13px; line-height: 1.5; color: #0f172a; white-space: pre-wrap; word-break: break-all; margin: 0; } a .export-title { font-size: 24px; font-weight: 700; color: #0f172a; margin-bottom: 30px; } .chat-section { margin-bottom: 25px; border-radius: 8px; padding: 20px; } .prompt-section { background-color: #f8fafc; border-left: 4px solid #64748b; } .response-section { background-color: #ffffff; border-left: 4px solid #3b82f6; border: 1px solid #f1f5f9; } .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; } .prompt-section .section-label { color: #64748b; } .response-section .section-label { color: #3b82f6; } .content { color: #334155; font-size: 15px; white-space: pre-wrap; } .code-block-wrapper, pre { margin: 8px; padding: 16px; display: inline-flex; align-items: center; vertical-align: middle; background-color: #f1f5f9; border-radius: 4px; border: 1px solid #e2e8f0; } .code-block-wrapper pre, pre code { display: inline; font-size: 0.9em; font-family: "Consolas", "Fira Code", "Courier New", monospace; color: #0f172a; white-space: pre; word-break: normal; margin: 0; white-space: pre-wrap; word-wrap: break-word; word-break: break-all; } table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; } th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; color: #334155; } th { background-color: #f8fafc; color: #0f172a; font-weight: 600; } tr:nth-child(even) { background-color: #fdfdfd; } img + div {padding-bottom: 0px !important; display: none} </style></head>' +
            '<body><div class="file-banner">AI CHAT LOG</div><a href="' + chatData.url + '"><h1 class="export-title">' + chatData.title + '</h1></a>' + dialoguesHtml + '</body></html>';

        return htmlContent;
    }
}

module.exports = KimiSupplier;
