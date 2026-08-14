const { getConfig } = require('../config');
const GeminiSupplier = require('./GeminiSupplier');
const GoogleSearchAISupplier = require('./GoogleSearchAISupplier');
const DeepSeekSupplier = require('./DeepSeekSupplier');
const KimiSupplier = require('./KimiSupplier');
const CopilotSupplier = require('./CopilotSupplier');
const ChatGPTSupplier = require('./ChatGPTSupplier');
const ClaudeSupplier = require('./ClaudeSupplier');
const QwenSupplier = require('./QwenSupplier');

const aiRegistry = new Map();

function register(supplier) {
    aiRegistry.set(supplier.id, supplier);
}

register(new GeminiSupplier());
register(new GoogleSearchAISupplier());
register(new DeepSeekSupplier());
register(new KimiSupplier());
register(new CopilotSupplier());
register(new ChatGPTSupplier());
register(new ClaudeSupplier());
register(new QwenSupplier());

function getSupplierByUrl(url, checkRealChat = false) {
    if (!url) return null;
    for (const supplier of aiRegistry.values()) {
        if (checkRealChat && supplier.checkRealChatURL(url)) {
            return supplier
        } else if (supplier.matchesUrl(url)) {
            return supplier;
        }
    }
    return null;
}

async function isAnySupplierReady(webContents) {
    const results = await Promise.all(
        Array.from(aiRegistry.values()).map(s => s.isRealChatReady(webContents).catch(() => false))
    );
    return results.some(Boolean);
}

function getDefaultSupplier() {
    const defaultId = getConfig('defaultAISupplier') ?? 'google_gemini';
    return aiRegistry.get(defaultId) || aiRegistry.get('google_gemini');
}

function isDefaultSupplier(id) {
    const currentDefaultId = getConfig('defaultAISupplier') ?? 'google_gemini';
    return id === currentDefaultId;
}

function isDefaultSupplierSet() {
    return getConfig('defaultAISupplier') !== '';
}

function getAllSuppliers() {
    return Array.from(aiRegistry.values());
}

function getNextLandingPage(currentUrl) {
    const urlList = getAllSuppliers().map(s => s.landingPage);

    if (!currentUrl) {
        return urlList[0];
    }

    const currentIndex = urlList.indexOf(currentUrl);
    if (currentIndex === -1) {
        return urlList[0];
    }

    const nextIndex = (currentIndex + 1) % urlList.length;

    return urlList[nextIndex];
}

module.exports = {
    aiRegistry,
    getSupplierByUrl,
    isAnySupplierReady,
    getDefaultSupplier,
    isDefaultSupplier,
    isDefaultSupplierSet,
    getAllSuppliers,
    getNextLandingPage
};
