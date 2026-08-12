class BaseAISupplier {
    constructor(id, label, landingPage, unstable = false) {
        this.id = id;
        this.label = label + (unstable ? ' (Unstable due to Cloudflare)' : '');
        this.landingPage = landingPage;
        this.limited = unstable;
    }

    checkRealChatURL(url) {
        throw new Error(`checkRealChatURL not implemented for ${this.id}`);
    }

    matchesLandingPage(url) {
        return url === this.landingPage;
    }

    matchesUrl(url) {
        try {
            return new URL(url).origin === new URL(this.landingPage).origin;
        } catch (e) {
            return false;
        }
    }

    async isRealChatReady(webContents) {
        throw new Error(`isRealChatReady not implemented for ${this.id}`);
    }

    getQuickLauncherJS() {
        return null;
    }

    getLocalStorageThemeBridgeKeys() {
        return [];
    }

    handleLocalStorageThemeBridge({ key, value, toggleTheme }) {
        return undefined;
    }

    async applyViewTheme({ tabView, theme, currentTheme, setLocalStorage, removeLocalStorage }) {
        return false;
    }

    async getExportHtmlContent(webContents, type) {
        throw new Error(`getExportHtmlContent not implemented for ${this.id}`);
    }
}

module.exports = BaseAISupplier;
