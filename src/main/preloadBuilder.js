const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { getSupplierByUrl } = require('./suppliers');

const PARTS_DIR = path.join(__dirname, '..', 'preload', 'parts');
const cache = new Map();

function buildSource(supplierId) {
    const common = fs.readFileSync(path.join(PARTS_DIR, 'common.js'), 'utf8');

    if (supplierId === 'common') return common;

    const partPath = path.join(PARTS_DIR, `${supplierId}.js`);
    if (!fs.existsSync(partPath)) {
        return common;
    }

    const part = fs.readFileSync(partPath, 'utf8');
    return `${part}\n\n${common}`;
}

function buildTabPreload(url) {
    const supplier = getSupplierByUrl(url);
    const supplierId = supplier ? supplier.id : 'common';
    if (cache.has(supplierId)) return cache.get(supplierId);

    const source = buildSource(supplierId);
    const dir = path.join(app.getPath('userData'), 'preloads');
    fs.mkdirSync(dir, { recursive: true });

    const file = path.join(dir, `preload-tab-${supplierId}-${app.getVersion()}.js`);
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, source);
    }

    cache.set(supplierId, file);
    return file;
}

async function cleanupOldPreloads() {
    const dir = path.join(app.getPath('userData'), 'preloads');
    let files;
    try {
        files = await fs.promises.readdir(dir);
    } catch (e) {
        return;
    }

    const currentVersion = app.getVersion();
    await Promise.all(
        files
            .filter(f => !f.includes(currentVersion))
            .map(f => fs.promises.unlink(path.join(dir, f)).catch(() => { }))
    );
}

module.exports = { buildTabPreload, cleanupOldPreloads };
