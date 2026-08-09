const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const configPath = path.join(app.getPath('userData'), 'user-config.json');

function readConfig() {
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (e) { }
    return {};
}

function saveConfig(key, value) {
    try {
        const config = readConfig();
        config[key] = value;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    } catch (e) { }
}

function getConfig(key) {
    const config = readConfig();
    return config[key] !== undefined ? config[key] : null;
}

module.exports = { configPath, readConfig, saveConfig, getConfig };
