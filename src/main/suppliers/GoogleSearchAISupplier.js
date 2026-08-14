const { net } = require('electron');
const BaseAISupplier = require('./BaseAISupplier');
const { APP_USER_AGENT } = require('../constants');

class GoogleSearchAISupplier extends BaseAISupplier {
    constructor() {
        super('google_search_ai_mode', 'Google Search (AI Mode)', 'https://www.google.com/search?atvm=2&udm=50');
    }

    checkRealChatURL(currentURL, ignoreExtraParams = false) {
        try {
            const targetUrl = new URL(this.landingPage);
            const currentUrlObj = new URL(currentURL);

            const isBaseMatch = currentUrlObj.origin === targetUrl.origin &&
                currentUrlObj.pathname === targetUrl.pathname;

            const targetParams = targetUrl.searchParams;
            const currentParams = currentUrlObj.searchParams;
            const extraParams = new URLSearchParams([['q', ''], ['mstk', '']]);

            const isQueryMatch = Array.from(targetParams.keys()).every(key => currentParams.has(key) && currentParams.get(key) === targetParams.get(key)
            );
            const isExtraMatch = Array.from(extraParams.keys()).every(key => currentParams.has(key));

            return isBaseMatch && isQueryMatch && (isExtraMatch || ignoreExtraParams);
        } catch (err) {
            return false;
        }
    }

    async isRealChatReady(webContents) {
        return await webContents.executeJavaScript(`
                !!(document.querySelector('div[data-xid="aim-mars-turn-root"]') && document.querySelector('div[data-scope-id="turn"]') && document.querySelector('div[data-container-id="main-col"]') && document.querySelector('div[data-container-id="main-col"]').querySelector('div[style="display: contents"]').innerText.trim() !== '')
                `);
    }

    matchesLandingPage(url) {
        try {
            const targetUrl = new URL(this.landingPage);
            const currentUrlObj = new URL(url);

            const isBaseMatch = currentUrlObj.origin === targetUrl.origin &&
                currentUrlObj.pathname === targetUrl.pathname;

            const targetParams = targetUrl.searchParams;
            const currentParams = currentUrlObj.searchParams;

            const isQueryMatch = Array.from(targetParams.keys()).every(key => currentParams.has(key) && currentParams.get(key) === targetParams.get(key)
            );

            return isBaseMatch && isQueryMatch;
        } catch (err) {
            return false;
        }
    }

    getQuickLauncherJS() {
        return `
            (function() {
                const inputEl = document.querySelector('div[data-xid="aim-zero-state-input-plate"]');
                const stateEl = document.querySelector('div[data-xid="aim-zero-state"]').parentElement;
                if (!inputEl || !stateEl) return null;

                stateEl.style['-webkit-app-region'] = 'drag';
                inputEl.style['-webkit-app-region'] = 'no-drag';
                const inputDomRect = inputEl.getBoundingClientRect();
                const overlayEl = inputEl.querySelector('div[data-is-aim-input-menu]');

                let overlayHeight = 0; 
                let top = inputDomRect.top;
                
                if (overlayEl && overlayEl.getBoundingClientRect().height > 0) {
                    stateEl.style['-webkit-app-region'] = 'no-drag';
                    const overlayDomRect = overlayEl.getBoundingClientRect();
                    if (overlayDomRect.y + overlayDomRect.height > inputDomRect.y + inputDomRect.height) {
                        overlayHeight = overlayDomRect.height - (inputDomRect.y + inputDomRect.height - overlayDomRect.y);
                    }

                    if (overlayDomRect.y < inputDomRect.y) {
                        top = overlayDomRect.top;
                        overlayHeight = inputDomRect.y - overlayDomRect.y;
                    }
                } else {
                    stateEl.style['-webkit-app-region'] = 'drag';
                    inputEl.style['-webkit-app-region'] = 'no-drag';
                }

                const container = document.querySelector('[data-xid$="-turns-container"]');

                if (container) {
                    container.style['-webkit-app-region'] = 'no-drag';
                    const containerDomRect = container.getBoundingClientRect();
                    const containerDomRectHeight = containerDomRect.height + containerDomRect.y - inputDomRect.height - inputDomRect.y;
                    overlayHeight = overlayHeight > containerDomRectHeight ? overlayHeight : containerDomRectHeight;
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

    async getURL(tabView, url) {
        try {
            if (url) {
                const rawCookies = await tabView.webContents.session.cookies.get({ url: url.href });
                const cookieString = rawCookies
                    .filter(c => c && c.name && c.value)
                    .map(c => `${c.name}=${c.value}`)
                    .join('; ');

                const headers = {
                    'User-Agent': APP_USER_AGENT,
                    'Accept': '*/*'
                };

                if (cookieString) {
                    headers['Cookie'] = cookieString;
                }

                const response = await net.fetch(url.href, {
                    method: 'GET',
                    headers
                });

                return await response.text();
            }
        } catch (netErr) {}

        return '';
    }

    async applyViewTheme({ tabView, theme, currentTheme, setLocalStorage, removeLocalStorage }) {
        try {
            const currentURL = tabView.webContents.getURL();
            if (!(this.matchesUrl(tabView.webContents.getURL()) || currentURL === 'about:blank')) {
                return false;
            }

            const preferences = `https://www.google.com/preferences`;
            const htmlContent = await this.getURL(tabView, new URL(preferences));

            if (htmlContent) {
                const jsCode = `
                    (() => {
                        try {
                            const parser = new DOMParser(); 
                            const tempDoc = parser.parseFromString(${JSON.stringify(htmlContent)}, 'text/html'); 
                            const dataValue = tempDoc.querySelector('div[aria-labelledby="cs-radio"]').querySelector('input[checked="checked"]').parentElement.querySelector('label').getAttribute('data-value');
                            const dataSpbu = tempDoc.querySelector('div[data-spbu]').getAttribute('data-spbu');
                            return {dataValue: dataValue, dataSpbu: dataSpbu};
                        } catch (e) {}
                    })();
                `;

                const currentValue = await tabView.webContents.executeJavaScript(jsCode);
                if (!currentValue) return false;
                const targetValue = theme === 'system' ? '0' : (theme === 'dark' ? '2' : '1');
                if (currentValue.dataValue === targetValue) return false;

                const spbu = currentValue.dataSpbu;

                if (spbu) {
                    const url = new URL(spbu);
                    url.searchParams.append('cs', targetValue);
                    url.searchParams.append('noredirect', '1');

                    await this.getURL(tabView, url);

                    return true;
                }
            }
        } catch (netErr) { }

        return false;
    }

    async getExportHtmlContent(webContents, type) {
        const jsCode = `(function() { try { 
            const turns = []; 
            const rawHTMLString = document.body.innerHTML; 
            const parser = new DOMParser(); 
            const tempDoc = parser.parseFromString(rawHTMLString, 'text/html'); 
            const turnItems = tempDoc.querySelector('div[data-xid="aim-mars-turn-root"]')?.querySelectorAll('div[data-scope-id="turn"]'); 
            
            (turnItems ?? []).forEach((turnItem) => { 
                let promptEl = null; 
                if (turnItem.innerHTML.includes('You said:')) { 
                    const spans = turnItem.querySelectorAll('span:not([class])'); 
                    promptEl = Array.from(spans ?? []).filter(el => el && el.innerText && el.innerText.trim() !== ''); 
                } else { 
                    const streamingContainer = turnItem.closest('div[data-streaming-container]'); 
                    const spans = streamingContainer ? streamingContainer.querySelectorAll('span:not([class])') : []; 
                    promptEl = Array.from(spans ?? []).filter(el => el && el.innerText && el.innerText.trim() !== ''); 
                } 

                const promptText = promptEl && promptEl[0] && promptEl[0].innerText ? promptEl[0].innerText.trim() : ""; 
                
                let ignored = []; 
                const divs = turnItem.querySelector('div[data-container-id="main-col"]')?.querySelectorAll('ul,ol,table,span,div[data-sfc-root="ep"]:not([data-container-id]):not([data-animation-skip]):not([style*="display:none"]):not([style*="display: none"]):not(:has(table))'); 
                
                let responses = Array.from(divs ?? []).filter(el => { 
                    if (ignored.includes(el)) { return false; } 
                    const txt = el.innerText ? el.innerText.trim() : ""; 
                    if (txt === '') return false; 

                    if (!el.hasAttribute('data-sfc-root') || el.getAttribute('data-sfc-root') !== 'ep') {
                        const isPartofAIBody = el.closest('div[data-sfc-root="ep"]') !== null;
                        if (!isPartofAIBody) {
                        return false;
                        }
                    }

                    if (el.tagName === 'BUTTON' || el.tagName === 'SVG' || el.tagName === 'IMG' || el.tagName === 'FORM') {
                        return false;
                    }
                    
                    el.querySelectorAll('span').forEach(span => { 
                        const innerButton = span.querySelector('button'); 
                        if (innerButton) { 
                            const buttonHasGraphics = innerButton.querySelector('img') !== null || innerButton.querySelector('svg') !== null; 
                            if (buttonHasGraphics) { span.remove(); } 
                        } 
                    }); 
                    
                    if (!el.hasAttribute('data-sfc-root')) { 
                        const outerButton = el.closest('button'); 
                        const belongsToAnchor = el.closest('a') !== null; 
                        const containsImage = el.querySelector('img') !== null || el.querySelector('svg') !== null || el.tagName === 'IMG'; 
                        if (outerButton || (belongsToAnchor || containsImage)) { return false; } 
                    } 
                    
                    let result = el.innerText.trim() !== '' && (el.tagName !== 'SPAN' || (el.tagName === 'SPAN' && el.querySelector('button') === null)); 
                    if (result) { 
                        const ig = el.querySelectorAll('span'); 
                        ignored = [...ignored, ...Array.from(ig)]; 
                    } 
                    return result; 
                }); 

                for (let i = responses.length - 1; i >= 0; i--) { 
                    const currentEl = responses[i]; 

                    const hasClutterControls = currentEl.querySelector('button') || currentEl.querySelector('svg') || currentEl.querySelector('form') || currentEl.tagName === 'FORM';
                    const hasSystemFeedbackAttributes = currentEl.querySelector('[aria-label*="feedback"]') || currentEl.querySelector('[aria-label*="share"]') || currentEl.querySelector('a[href*="privacy"]') || currentEl.querySelector('a[href*="terms"]') || currentEl.querySelector('a[href*="support"]');
                    
                    if (hasClutterControls || hasSystemFeedbackAttributes) { 
                        responses.splice(i, 1);
                    } 
                }

                function htmlEscape(codeString) {
                    const div = document.createElement('div');
                    div.textContent = codeString;
                    return div.innerHTML;
                }

                const allowedTags = ['STRONG', 'CODE', 'UL', 'OL', 'LI', 'TABLE', 'TBODY', 'TH', 'TR', 'TD'];

                function cleanNode(node) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        return node.nodeValue;
                    }

                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const tagName = node.tagName;

                        if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT' || tagName === 'TEMPLATE') {
                            return '';
                        }

                        let childContent = '';
                        node.childNodes.forEach(child => {
                        childContent += cleanNode(child);
                        });

                        if (allowedTags.includes(tagName)) {
                            const lowerTag = tagName.toLowerCase();

                            if (lowerTag === 'code') {
                                return '<div class="code-block-wrapper"><pre><' + lowerTag + '>' + htmlEscape(childContent) + '</' + lowerTag + '></pre></div>';
                            } else {
                                return '<' + lowerTag + '>' + childContent + '</' + lowerTag + '>';
                            }
                        } else if (tagName === 'DIV' && node.getAttribute('role') === 'heading') {
                            const level = node.getAttribute('aria-level');

                            if (level) {
                                return '<h' + level + '>' + childContent + '</h' + level + '>';
                            }
                        }

                        return childContent;
                    }

                    return '';
                }
                
                let responseText = responses.map(res => {
                        if (res.innerText) {
                            const text = cleanNode(res);

                            return text.replace(/Use code with caution./g, '');
                        } else {
                            return "";
                        }
                    }).filter(t => t !== "").join('\\n'); 

                if (promptText || responseText) { 
                    turns.push({ promptText: promptText, responseText: responseText }); 
                } 
            }); 

            
            const chatData = { title: document.title || "AI CHAT LOG", url: document.location.href, dialogues: turns }; 
            
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
            '<style>@page { size: A4; margin: 0; } body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; margin: 0; padding: 50px; color: #1e293b; background-color: #ffffff; line-height: 1.6; font-size: 15px;} .file-banner { font-size: 12px; font-weight: 600; color: #64748b; padding-bottom: 12px; margin-bottom: 35px; border-bottom: 1px solid #e2e8f0; letter-spacing: 1px; text-transform: uppercase;} pre { font-family: "Consolas", "Fira Code", "Courier New", monospace; font-size: 13px; line-height: 1.5; color: #0f172a; white-space: pre-wrap; word-break: break-all; margin: 0; } a .export-title { font-size: 24px; font-weight: 700; color: #0f172a; margin-bottom: 30px; } .chat-section { margin-bottom: 25px; border-radius: 8px; padding: 20px; } .prompt-section { background-color: #f8fafc; border-left: 4px solid #64748b; } .response-section { background-color: #ffffff; border-left: 4px solid #3b82f6; border: 1px solid #f1f5f9; } .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; } .prompt-section .section-label { color: #64748b; } .response-section .section-label { color: #3b82f6; } .content { color: #334155; font-size: 15px; white-space: pre-wrap; } .code-block-wrapper { margin: 8px; padding: 16px; display: inline-flex; align-items: center; vertical-align: middle; background-color: #f1f5f9; border-radius: 4px; border: 1px solid #e2e8f0; } .code-block-wrapper pre { display: inline; font-size: 0.9em; font-family: "Consolas", "Fira Code", "Courier New", monospace; color: #0f172a; white-space: pre; word-break: normal; margin: 0; white-space: pre-wrap; word-wrap: break-word; word-break: break-all; } table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; } th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; color: #334155; } th { background-color: #f8fafc; color: #0f172a; font-weight: 600; } tr:nth-child(even) { background-color: #fdfdfd; } </style></head>' +
            '<body><div class="file-banner">AI CHAT LOG</div><a href="' + chatData.url + '"><h1 class="export-title">' + chatData.title + '</h1></a>' + dialoguesHtml + '</body></html>';

        return htmlContent;
    }
}

module.exports = GoogleSearchAISupplier;
