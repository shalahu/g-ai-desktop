# G-AI Desktop

G-AI Desktop is a lightweight, modern, and feature-rich Electron-based desktop client for **Google Gemini**, **Google Search (AI Mode)** and **DeepSeek**. It preserves the full capabilities of the official web interfaces while delivering a more native, efficient, and visually polished desktop experience.

---

## ✨ Features

*   **⚡ Quick Launcher (Feature Highlight)**:
    *   **Instant Access**: Summon a minimal, Spotlight-like quick prompt bar from anywhere across your operating system using a global hotkey.
    *   **Direct AI Querying**: Type your question or prompt directly into the launcher and hit Enter to instantly dispatch it to **Google Gemini**, **Google Search (AI Mode)** or **DeepSeek**.
*   **⚙️ Customizable On-Startup Behavior (Feature Highlight)**:
    *   **Silent / Minimized Start**: Configure the app to start hidden in the system tray upon boot, keeping your desktop clean while keeping AI access one shortcut away.
    *   **Default Landing Choice**: Choose whether the app launches into **Google Gemini**, **Google Search (AI Mode)** or **DeepSeek** by default.
*   **🌐 Command-Line Proxy Support (Feature Highlight)**: Launch the app with custom proxy settings using the `--proxy=` flag, supporting HTTP, HTTPS, and SOCKS5 protocols (e.g., `--proxy="http://127.0.0.1:8888"` or `--proxy="socks5://127.0.0.1:1080"`)
*   **💡 Full Google Search (AI Mode) Support**: Built-in support for **Google Search (AI Mode)** alongside **Google Gemini** and **DeepSeek**. Easily set it as your default landing page or switch between suppliers.  
*   **🔎 Native Web Page Search (Feature Highlight)**:
    *   **In-Page Text Find**: An all-new, elegant search bar to find text within any active web page, just like a native browser.
    *   **Real-time Matching**: Highlights matches instantly and provides a navigation counter (e.g., "1/5").
    *   **Suppliers Agnostic**: Works perfectly across **Google Gemini**, **Google Search (AI Mode)** and **DeepSeek** interfaces.
    *   **Shortcut integration**: Seamlessly integrated with the CmdOrCtrl + F shortcut and Esc key.
*   **📎 Smart Multi-File Upload & Auto-PDF Merger (Feature Highlight)**:
    *   **Expanded File Type Support**: Support uploading Word documents (.doc, .docx), Excel/CSV sheets (.csv), raw plain text, code files (Python, JS, C++, TS, Markdown, etc.), images (PNG, JPG, WebP, GIF, HEIC, etc.), and native PDFs directly within **Google Search (AI Mode)**.
    *   **One-Click Auto-Merger**: Select multiple files of varying formats at once—the app automatically parses, formats, and merges them into a single, clean PDF file on the fly before sending it to **Google Search (AI Mode)**.  
*   **💾 High-Fidelity Chat Export**:
    *   Export your active chat conversations from **Google Gemini** or **Google Search (AI Mode)** or **DeepSeek** into **HTML**, **PDF** formats.
    *   Automatically parses user prompts, AI responses, code blocks, and data tables while **embedding remote images** as Base64 for seamless offline viewing.  
*   **🗂️ Advanced Multi-Tab Management**: Create, switch, and close tabs seamlessly just like in a web browser, making it effortless to organize multiple chat threads simultaneously.
*   **🎨 Dynamic Theme Synchronization**: Full out-of-the-box support for Dark and Light modes, including automatic system theme detection. It achieves flawless, bi-directional theme synchronization between the desktop shell UI and the Gemini web interface.
*   **⌨️ Native Shortcuts & Tray Integration**:
    *   `CmdOrCtrl + F`: Toggle the In-Page Text Find search bar.
    *   `CmdOrCtrl + Shift + Space`: Globally toggle (Show/Hide) the application window.
    *   `CmdOrCtrl + Shift + Alt + Space`:Globally toggle Open Quick Launcher with supplier page rotation.
    *   `CmdOrCtrl + = / - / 0` or `CmdOrCtrl + Mouse Wheel / Middle Click`: Flexibly zoom in, zoom out, or reset the interface scaling.
    *   `CmdOrCtrl + Shift + M`: Easily show or hide the application title bar/menu bar.
    *   `F11`: Toggle fullscreen mode.
    *   `Esc`: Close the active search bar or Quick Launcher window.
    *   **System Tray Companion**: Stays running in the background with customizable "Minimize to Tray on Close" behavior to avoid accidental loss of workspace.

---

## 🛠️ Tech Stack

*   **Core**: Electron 39.x
*   **Runtime**: Node.js & Chromium
*   **Frontend**: Vanilla JS / CSS3 (Native CSS Variables)

---

## 🚀 Getting Started

### Installation
Download the latest release from the [Releases](https://github.com/shalahu/g-ai-desktop/releases) tab.

### Development Setup
```bash
# Clone the repository
git clone https://github.com/shalahu/g-ai-desktop.git

# Navigate into the project folder
cd g-ai-desktop

# Install dependencies
npm install

# Start the application
npm start
```

### Building & Packaging
```bash
npm run build
```

### Preview
![G-AI Desktop gm_ql.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/gm_ql.jpg)

![G-AI Desktop gs_ql.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/gs_ql.jpg)

![G-AI Desktop ds_ql.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/ds_ql.jpg)

![G-AI Desktop search.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/search.jpg)

![G-AI Desktop export-g-ai.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/export-g-ai.jpg)

![G-AI Desktop multiple-files.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/multiple-files.jpg)

![G-AI Desktop file.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/file.jpg)

![G-AI Desktop view.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/view.jpg)

![G-AI Desktop settings.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/settings.jpg)

![G-AI Desktop help.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/help.jpg)

![G-AI Desktop context-menu.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/context-menu.jpg)

![G-AI Desktop light.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/light.jpg)

![G-AI Desktop dark.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/dark.jpg)

## ❤️ Acknowledgements & Disclaimer

### 🌟 Acknowledgements
1.  **[bwendell/gemini-desktop](https://github.com/bwendell/gemini-desktop)**: The core inspiration and architectural vision of this project were deeply inspired by the excellent open-source project [gemini-desktop](https://github.com/bwendell/gemini-desktop). Huge thanks to the original author!
2.  **Google AI**: Heartfelt thanks to Google AI for providing invaluable technical assistance, code optimization recommendations, and creative support throughout the development process.

### ⚠️ Disclaimer
*   **Third-Party Software**: This is a **purely independent, third-party open-source desktop wrapper**.
*   **No Affiliation with Google**: This project and its developers are **NOT officially affiliated with, endorsed by, or in any way connected to Google Inc.**
*   **No Affiliation with DeepSeek**: This project and its developers are **NOT officially affiliated with, endorsed by, or in any way connected to DeepSeek.**  
*   **Content & Copyright**: 
    1.  All AI chat interfaces, functionalities, and the **"Gemini"** brand assets rendered within this app belong entirely to **Google**. 
    2.  All AI chat interfaces, functionalities, and the **"Google Search (AI Mode)"** brand assets rendered within this app belong entirely to **Google**. 
    3.  All AI chat interfaces, functionalities, and the **"DeepSeek"** brand assets rendered within this app belong entirely to **DeepSeek**. 
    4.  This client merely provides a local multi-tab container to enhance your desktop productivity.

---

## 📄 License

This project is open-sourced under the [MIT License](LICENSE.txt).