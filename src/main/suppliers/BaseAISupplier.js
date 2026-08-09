class BaseAISupplier {
    constructor(id, label, landingPage) {
        this.id = id;
        this.label = label;
        this.landingPage = landingPage;
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

    getThemeBridgeKeys() {
        return [];
    }

    handleThemeBridge({ key, value, toggleTheme }) {
        return undefined;
    }

    async applyViewTheme({ tabView, theme, currentTheme, setLocalStorage, removeLocalStorage }) {
        return false;
    }

    async exportChat(webContents, type) {
        throw new Error(`exportChat not implemented for ${this.id}`);
    }
}

module.exports = BaseAISupplier;
