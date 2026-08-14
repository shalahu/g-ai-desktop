const path = require('path');
const { app } = require('electron');
const { getConfig } = require('./config');

const APP_NAME = "G-AI Desktop";
const SIDE_PADDING = 0;
const IS_MAC = process.platform === 'darwin';
const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';
const DEFAULT_APP_HEADER_HEIGHT = 72;
const DEFAULT_TITLE_BAR_HEIGHT = 32;
const DEFAULT_MAIN_WINDOW_FRAME = getConfig('mainWindowFrame') ?? false;
const DEFAULT_ZOOM_FACTOR = 1;
const MIN_ZOOM_FACTOR = 0.5;
const MAX_ZOOM_FACTOR = 2;
const APP_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) G-AIDesktop/" + app.getVersion() + " Chrome/150.0.0.0 Electron/39.8.10 Safari/537.36";
const WORD_DOC_EXTS = ['doc', 'docx'];
const EXCEL_DATA_SHEET_EXTS = ['csv'];
const PLAIN_TEXT_EXTS = ['html', 'htm', 'txt', 'md', 'rtf', 'java', 'py', 'cpp', 'js', 'css', 'cs', 'json', 'ts', 'tsx', 'jsx', 'go', 'rs', 'sh', 'bat', 'yaml', 'yml', 'xml', 'ini', 'toml', 'sql', 'kt', 'swift', 'php', 'tsv', 'log', 'vcf', 'ps1'];
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'heic', 'heif'];
const CONVERTIBLE_TO_PDF_EXTS = [...WORD_DOC_EXTS, ...EXCEL_DATA_SHEET_EXTS, ...PLAIN_TEXT_EXTS, ...IMAGE_EXTS];
const APP_ID = 'com.g-ai.desktop';
const APP_WEBSITE = 'https://github.com/shalahu/g-ai-desktop/';
const ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'icons', 'icon.png');

module.exports = {
    APP_NAME,
    SIDE_PADDING,
    IS_MAC,
    IS_WINDOWS,
    IS_LINUX,
    DEFAULT_APP_HEADER_HEIGHT,
    DEFAULT_TITLE_BAR_HEIGHT,
    DEFAULT_MAIN_WINDOW_FRAME,
    DEFAULT_ZOOM_FACTOR,
    MIN_ZOOM_FACTOR,
    MAX_ZOOM_FACTOR,
    APP_USER_AGENT,
    WORD_DOC_EXTS,
    EXCEL_DATA_SHEET_EXTS,
    PLAIN_TEXT_EXTS,
    IMAGE_EXTS,
    CONVERTIBLE_TO_PDF_EXTS,
    APP_ID,
    APP_WEBSITE,
    ICON_PATH
};
