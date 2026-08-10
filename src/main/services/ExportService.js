const { app, BrowserWindow, dialog, nativeImage, Notification, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { getConfig } = require('../config');
const { APP_USER_AGENT, ICON_PATH } = require('../constants');
const { getSupplierByUrl } = require('../suppliers');

class ExportService {
    constructor({ fileService, windowManager, getActiveTabView }) {
        this.fileService = fileService;
        this.windowManager = windowManager;
        this.getActiveTabView = getActiveTabView;
    }

    async triggerExport(type) {
        const activeTabView = this.getActiveTabView();
        const supplier = getSupplierByUrl(activeTabView.webContents.getURL(), true);

        if (!supplier || !(await supplier.isRealChatReady(activeTabView.webContents))) {
            await dialog.showMessageBox(this.windowManager.mainWindow, {
                type: 'warning',
                title: 'Export Failed',
                message: 'No conversations found.',
                detail: 'The file cannot be exported because no active chat conversations were detected on this page.',
                buttons: ['OK']
            });
            return;
        }

        await this.blurActiveTabView(activeTabView);

        const htmlContent = await supplier.getExportHtmlContent(activeTabView.webContents, type);

        if (htmlContent) {
            await this.exportHTMLContent(activeTabView.webContents, htmlContent, type);
        }
    }

    createSolidColorImage(hexColor) {
        const hex = hexColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) : 255;

        const pngBuffer = Buffer.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01,
            0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00,
            0x1f, 0x15, 0xc4, 0x89,
            0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54,
            0x78, 0x9c, 0x63,
            0x60, 0x60, 0x60, 0x60, 0x00, 0x00,
            0x00, 0x02, 0x00, 0x01,
            0x32, 0x22, 0xa1, 0x81,
            0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
            0xae, 0x42, 0x60, 0x82
        ]);

        pngBuffer.writeUInt8(r, 41);
        pngBuffer.writeUInt8(g, 42);
        pngBuffer.writeUInt8(b, 43);
        pngBuffer.writeUInt8(a, 44);

        return nativeImage.createFromBuffer(pngBuffer);
    }

    convertHtmlImagesToBase64(htmlContent, eventSenderWebContents, outerHTML = true) {
        return new Promise(async (resolve, reject) => {
            let workerWindow = new BrowserWindow({
                show: false,
                webPreferences: {
                    offscreen: true,
                }
            });

            const tempFilePath = path.join(app.getPath('temp'), `worker_temp_${Date.now()}.html`);
            await fs.promises.writeFile(tempFilePath, htmlContent, 'utf-8');

            workerWindow.loadURL(`file://${tempFilePath}`);

            workerWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
                if (isMainFrame) {
                    reject(new Error(`Failed to load HTML: ${errorDescription} (${errorCode})`));
                    if (workerWindow) {
                        workerWindow.destroy();
                        workerWindow = null;
                    }
                }
            });

            workerWindow.webContents.on('did-finish-load', async () => {
                try {
                    let targetSession = null;
                    if (eventSenderWebContents && typeof eventSenderWebContents.isDestroyed === 'function' && !eventSenderWebContents.isDestroyed()) {
                        targetSession = eventSenderWebContents.session;
                    } else {
                        targetSession = workerWindow.webContents.session;
                    }

                    const imgUrls = await workerWindow.webContents.executeJavaScript(`
                    Array.from(document.querySelectorAll('img'))
                        .map(img => img.getAttribute('src'))
                        .filter(src => src && src.startsWith('http') && !src.startsWith('data:'));
                `);

                    const GOOGLE_COOKIE_DOMAINS = ['google.com', 'googleusercontent.com', 'gstatic.com', 'googleapis.com', 'ggpht.com', 'googlevideo.com'];

                    const isGoogleHost = (hostname) => GOOGLE_COOKIE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));

                    const buildCookieHeader = async (url) => {
                        let hostname = '';
                        try {
                            hostname = new URL(url).hostname.toLowerCase();
                        } catch (e) {
                            return '';
                        }

                        if (isGoogleHost(hostname)) {
                            const rawCookies = await targetSession.cookies.get({});
                            const GOOGLE_AUTH_COOKIE_NAMES = ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID', 'ACCOUNT', 'OSID'];
                            const sanitizedCookies = rawCookies
                                .filter(c => c && c.name && c.value)
                                .filter(c => GOOGLE_AUTH_COOKIE_NAMES.includes(c.name) || c.domain.includes('google'))
                                .map(c => `${c.name}=${c.value}`);

                            return [...new Set(sanitizedCookies)].join('; ');
                        }

                        try {
                            const rawCookies = await targetSession.cookies.get({ url });
                            return rawCookies
                                .filter(c => c && c.name && c.value)
                                .map(c => `${c.name}=${c.value}`)
                                .join('; ');
                        } catch (e) {
                            return '';
                        }
                    };

                    const base64Map = {};

                    for (let url of imgUrls) {
                        try {
                            const cookieString = await buildCookieHeader(url);
                            const headers = {
                                'User-Agent': APP_USER_AGENT,
                                'Referer': `${new URL(url).origin}/`,
                                'Accept': 'image/avif,image/webp,image/png,image/*,*/*;q=0.8'
                            };
                            if (cookieString) {
                                headers['Cookie'] = cookieString;
                            }

                            const response = await net.fetch(url, {
                                method: 'GET',
                                headers
                            });

                            if (response.ok) {
                                const arrayBuffer = await response.arrayBuffer();
                                const base64Str = Buffer.from(arrayBuffer).toString('base64');
                                const contentType = response.headers.get('content-type') || 'image/png';

                                base64Map[url] = `data:${contentType};base64,${base64Str}`;
                            }
                        } catch (netErr) { }
                    }

                    await workerWindow.webContents.executeJavaScript(`
                    const map = ${JSON.stringify(base64Map)};
                    document.querySelectorAll('img').forEach(img => {
                        if (map[img.src]) { img.src = map[img.src]; }
                    });
                `);

                    const cleanedHtmlContent = outerHTML ? await workerWindow.webContents.executeJavaScript(`
                    document.documentElement.outerHTML;
                `) : await workerWindow.webContents.executeJavaScript(`
                    document.documentElement.innerHTML;
                `);

                    resolve(cleanedHtmlContent);

                } catch (err) {
                    reject(err);
                } finally {
                    if (workerWindow) {
                        workerWindow.destroy();
                        workerWindow = null;
                    }
                }
            });
        });
    }

    async blurActiveTabView(activeTab = null) {
        if (!activeTab) activeTab = this.getActiveTabView();
        let base64Data = null;
        let image = null;

        if (activeTab) {
            image = await activeTab.webContents.capturePage();
            base64Data = image.toDataURL();

            activeTab.setBounds({ x: 0, y: 0, width: 0, height: 0 });
        }

        const bounds = this.windowManager.mainWindow.getContentBounds();
        this.windowManager.titleBarView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });

        if (!activeTab) {
            image = this.createSolidColorImage(getConfig('theme') === 'dark' ? '#131314' : '#f0f4f9');
            base64Data = image.toDataURL();
        }

        this.windowManager.titleBarView.webContents.send('set-tab-bar-background', base64Data);
    }

    unblurActiveTabView() {
        const image = this.createSolidColorImage(getConfig('theme') === 'dark' ? '#131314' : '#f0f4f9');
        const base64Data = image.toDataURL();

        this.windowManager.titleBarView.webContents.send('set-tab-bar-background', base64Data);

        this.windowManager.resizeViews();
    }

    async exportHTMLContent(sender, htmlContent, type) {
        await this.blurActiveTabView();
        const focusedWindow = BrowserWindow.getFocusedWindow();

        let fileTitle = 'exported_conversation';
        let filters = { name: 'All (*.*)', extensions: [''] };
        let content = '';

        try {
            const match = htmlContent.match(/<h1 class="export-title">([\s\S]*?)<\/h1>/);

            if (match) {
                fileTitle = this.fileService.strictSafeFilename(match[1].trim(), fileTitle);
            }

            switch (type) {
                case 'html':
                    content = await this.convertHtmlImagesToBase64(htmlContent, sender);
                    filters = { name: 'HTML Document (*.' + type + ';*.htm)', extensions: [type, 'htm'] };
                    break;
                case 'pdf':
                    content = await this.fileService.generatePdfFromEmbeddedHtml(await this.convertHtmlImagesToBase64(htmlContent, sender));
                    filters = { name: 'PDF Document (*.' + type + ')', extensions: [type] };
                    break;
            }

            this.unblurActiveTabView();

            const { canceled, filePath } = await dialog.showSaveDialog(focusedWindow, {
                title: 'Save As',
                defaultPath: path.join(app.getPath('downloads'), fileTitle + `_${Date.now()}.` + type),
                filters: [
                    filters
                ]
            });

            if (!canceled && filePath) {
                await fs.promises.writeFile(filePath, content, 'utf-8');
                const notice = new Notification({
                    title: 'Export Success',
                    body: 'Your file is ready.',
                    silent: false,
                    icon: ICON_PATH
                })

                notice.show()
            }

        } catch (err) { }
    }
}

module.exports = ExportService;
