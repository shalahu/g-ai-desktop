const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const mammoth = require('mammoth');
const csvtojson = require('csvtojson');
const {
    WORD_DOC_EXTS,
    EXCEL_DATA_SHEET_EXTS,
    PLAIN_TEXT_EXTS,
    IMAGE_EXTS,
    CONVERTIBLE_TO_PDF_EXTS
} = require('../constants');

class FileService {
    parseAcceptToFilters(acceptStr) {
        if (!acceptStr) return [];

        const extensions = [...CONVERTIBLE_TO_PDF_EXTS];
        const items = acceptStr.split(',');

        items.forEach(item => {
            const trimmed = item.trim().toLowerCase();
            if (trimmed.startsWith('.')) {
                extensions.push(trimmed.substring(1));
            }

            else if (trimmed.includes('/')) {
                const ext = trimmed.split('/')[1];
                if (ext && ext !== '*') {
                    extensions.push(ext);
                }
            }
        });

        const uniqueExts = Array.from(new Set(extensions));
        if (uniqueExts.includes('jpeg') && !uniqueExts.includes('jpg')) uniqueExts.push('jpg');

        return [{ name: 'Custom Files', extensions: uniqueExts }];
    }

    getExactMimeType(ext) {
        const map = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.pdf': 'application/pdf',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp',
            '.avif': 'image/avif',
            '.heic': 'image/heic',
            '.heif': 'image/heif'
        };
        return map[ext] || 'application/octet-stream';
    }

    strictSafeFilename(userInputName, defaultTitle) {
        let safeName = userInputName.replace(/[\/\\:*?"<>|]/g, '_');

        safeName = safeName.replace(/^\.+/, '');

        const encoder = new TextEncoder();
        const decoder = new TextDecoder("utf-8");
        let buf = encoder.encode(safeName);

        if (buf.length > 255) {
            safeName = decoder.decode(buf.slice(0, 255));
        }

        return safeName || defaultTitle;
    }

    generatePdfFromEmbeddedHtml(embeddedHtmlContent) {
        return new Promise(async (resolve, reject) => {
            let workerWindow = new BrowserWindow({
                show: false
            });

            const tempFilePath = path.join(app.getPath('temp'), `worker_temp_${Date.now()}.html`);
            await fs.promises.writeFile(tempFilePath, embeddedHtmlContent, 'utf-8');

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
                    const pdfBuffer = await workerWindow.webContents.printToPDF({
                        printBackground: true,
                        pageSize: 'A4',
                        marginsType: 1
                    });

                    resolve(pdfBuffer);
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

    async uploadFiles(event, acceptString) {
        try {
            const webContents = event.sender;
            const win = BrowserWindow.fromWebContents(webContents);

            const customFilters = this.parseAcceptToFilters(acceptString);

            const result = await dialog.showOpenDialog(win, {
                title: 'Open',
                properties: ['openFile', 'multiSelections'],
                filters: customFilters
            });

            if (result.canceled || result.filePaths.length === 0) {
                return [];
            } else {
                const pdfBuffers = [];

                for (const filePath of result.filePaths) {
                    const fileName = path.basename(filePath);
                    const ext = path.extname(filePath).toLowerCase();
                    const cleanExt = ext.replace(/^\./, '');

                    const commonGlobalStyles = `
                    @page { size: A4; margin: 0; }
                    body { 
                        font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; 
                        margin: 0; padding: 50px; 
                        color: #1e293b; background-color: #ffffff; 
                        line-height: 1.6; font-size: 15px;
                    }
                    .file-banner { 
                        font-size: 12px; font-weight: 600; color: #64748b; 
                        padding-bottom: 12px; margin-bottom: 35px; 
                        border-bottom: 1px solid #e2e8f0;
                        letter-spacing: 1px; text-transform: uppercase;
                    }
                    pre { 
                        font-family: "Consolas", "Fira Code", "Courier New", monospace; 
                        font-size: 13px; line-height: 1.5; color: #0f172a;
                        white-space: pre-wrap; word-break: break-all; margin: 0; 
                    }
                `;

                    if (ext === '.pdf') {
                        const pdfBytes = await fs.promises.readFile(filePath);
                        const pdfDoc = await PDFDocument.load(pdfBytes);
                        const pages = pdfDoc.getPages();

                        if (pages.length > 0) {
                            const firstPage = pages[0];
                            const width = firstPage.getWidth();
                            const height = firstPage.getHeight();

                            const headerHtml = `
                        <html>
                        <head>
                            <style>
                                @page { size: ${width}pt ${height}pt; margin: 0; }
                                body { 
                                    font-family: "Microsoft YaHei", -apple-system, sans-serif; 
                                    margin: 0; padding: 25px 40px;
                                    background-color: transparent;
                                }
                                .pdf-chinese-header { 
                                    font-size: 11px; font-weight: 600; color: #64748b; 
                                    padding-bottom: 6px;
                                    border-bottom: 1px solid #e2e8f0; 
                                    letter-spacing: 0.5px;
                                }
                            </style>
                        </head>
                        <body>
                            <div class="pdf-chinese-header">PDF SOURCE: ${fileName}</div>
                        </body>
                        </html>`;

                            const ghostWindow = new BrowserWindow({ show: false });
                            await ghostWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(headerHtml)}`);
                            const headerPdfData = await ghostWindow.webContents.printToPDF({
                                printBackground: false
                            });
                            ghostWindow.close();

                            const headerDoc = await PDFDocument.load(headerPdfData);

                            const [embeddedHeaderPage] = await pdfDoc.embedPages([headerDoc.getPages()[0]]);

                            firstPage.drawPage(embeddedHeaderPage, {
                                x: 0,
                                y: 0,
                                width: width,
                                height: height
                            });
                        }

                        const modifiedPdfBytes = await pdfDoc.save();
                        pdfBuffers.push(modifiedPdfBytes);
                    }
                    else if (CONVERTIBLE_TO_PDF_EXTS.includes(cleanExt)) {
                        let htmlContent = '';

                        if (WORD_DOC_EXTS.includes(cleanExt)) {
                            const docResult = await mammoth.convertToHtml({ path: filePath });
                            htmlContent = `
                        <html>
                        <head>
                            <style>
                                ${commonGlobalStyles}
                                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                                th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
                                th { background-color: #f8fafc; font-weight: 600; }
                            </style>
                        </head>
                        <body>
                            <div class="file-banner">DOCUMENT: ${fileName}</div>
                            <div class="word-content">${docResult.value}</div>
                        </body>
                        </html>`;
                        }
                        else if (EXCEL_DATA_SHEET_EXTS.includes(cleanExt)) {
                            const jsonArray = await csvtojson().fromFile(filePath);

                            if (jsonArray.length > 0) {
                                const headers = Object.keys(jsonArray[0]);
                                let tableRows = '';

                                tableRows += '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';

                                jsonArray.forEach(row => {
                                    tableRows += '<tr>' + headers.map(h => `<td>${row[h] || ''}</td>`).join('') + '</tr>';
                                });

                                htmlContent = `
                            <html>
                            <head>
                                <style>
                                    ${commonGlobalStyles}
                                    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
                                    th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; color: #334155; }
                                    th { background-color: #f8fafc; color: #0f172a; font-weight: 600; }
                                    tr:nth-child(even) { background-color: #fdfdfd; } 
                                </style>
                            </head>
                            <body>
                                <div class="file-banner">DATA SHEET SOURCE: ${fileName}</div>
                                <table>${tableRows}</table>
                            </body>
                            </html>`;
                            }
                        }
                        else if (IMAGE_EXTS.includes(cleanExt)) {
                            const imageBuffer = await fs.promises.readFile(filePath);
                            const base64Data = imageBuffer.toString('base64');
                            const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${cleanExt}`;

                            htmlContent = `
                        <html>
                        <head>
                            <style>
                                ${commonGlobalStyles}
                                body { text-align: center; }
                                .img-container { 
                                    width: 100%; height: 75vh; 
                                    display: flex; justify-content: center; align-items: center; 
                                    margin-top: 20px; 
                                }
                                img { 
                                    max-width: 100%; max-height: 100%; object-fit: contain; 
                                    border: 1px solid #e2e8f0; padding: 6px; background: #ffffff;
                                }
                            </style>
                        </head>
                        <body>
                            <div class="file-banner">IMAGE SOURCE: ${fileName}</div>
                            <div class="img-container">
                                <img src="data:${mimeType};base64,${base64Data}" />
                            </div>
                        </body>
                        </html>`;
                        }
                        else if (PLAIN_TEXT_EXTS.includes(cleanExt)) {
                            const rawBuffer = await fs.promises.readFile(filePath, 'utf-8');
                            const rawText = rawBuffer.toString('utf8');
                            const sanitizedText = rawText.replace(/</g, '&lt;').replace(/>/g, '&gt;');

                            htmlContent = `
                        <html>
                        <head>
                            <style>${commonGlobalStyles}</style>
                        </head>
                        <body>
                            <div class="file-banner">TEXT SOURCE: ${fileName}</div>
                            <pre>${sanitizedText}</pre>
                        </body>
                        </html>`;
                        }

                        if (htmlContent) {
                            const pdfData = await this.generatePdfFromEmbeddedHtml(htmlContent);
                            pdfBuffers.push(pdfData);
                        }
                    }
                }

                const mergedPdf = await PDFDocument.create();

                for (const pdfBuffer of pdfBuffers) {
                    const srcDoc = await PDFDocument.load(pdfBuffer);
                    const copiedPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
                    copiedPages.forEach((page) => mergedPdf.addPage(page));
                }

                const finalPdfBytes = await mergedPdf.save();

                const finalPdfPath = path.join(app.getPath('temp'), `merged_files_${Date.now()}.pdf`);
                await fs.promises.writeFile(finalPdfPath, finalPdfBytes);

                return [finalPdfPath];
            }
        }
        catch (e) { }
    }

    async getFileData(filePath) {
        try {
            const stats = await fs.promises.stat(filePath);
            const buffer = await fs.promises.readFile(filePath);
            const ext = path.extname(filePath).toLowerCase();

            return {
                name: path.basename(filePath),
                size: stats.size,
                type: this.getExactMimeType(ext),
                bytes: new Uint8Array(buffer)
            };
        } catch (err) {
            return null;
        }
    }
}

module.exports = FileService;
