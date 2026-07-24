# G-AI Desktop

G-AI Desktop is a lightweight, modern, and feature-rich Electron-based desktop client for **Google Gemini** and **Google Search (AI Mode)**. It preserves the full capabilities of the official web interfaces while delivering a more native, efficient, and visually polished desktop experience.

---

## ✨ Features

*   **🔍 Full Google Search (AI Mode) Support**: Built-in support for **Google Search (AI Mode)** alongside **Google Gemini**. Easily set it as your default landing page or switch between suppliers.  

*   **📎 Smart Multi-File Upload & Auto-PDF Merger (Feature Highlight)**:
    *   **Expanded File Type Support**: Support uploading Word documents (.doc, .docx), Excel/CSV sheets (.csv), raw plain text, code files (Python, JS, C++, TS, Markdown, etc.), images (PNG, JPG, WebP, GIF, HEIC, etc.), and native PDFs directly within **Google Search (AI Mode)**.
    *   **One-Click Auto-Merger**: Select multiple files of varying formats at once—the app automatically parses, formats, and merges them into a single, clean PDF file on the fly before sending it to **Google Search (AI Mode)**.  
*   **💾 High-Fidelity Chat Export (Feature Highlight)**:
    *   Export your active chat conversations from **Google Gemini** or **Google Search (AI Mode)** into **HTML**, **PDF**, or **Word (.doc)** formats.
    *   Automatically parses user prompts, AI responses, code blocks, and data tables while embedding remote images as Base64 for seamless offline viewing.  
*   **🗂️ Advanced Multi-Tab Management**: Create, switch, and close tabs seamlessly just like in a web browser, making it effortless to organize multiple chat threads simultaneously.
*   **🎨 Dynamic Theme Synchronization**: Full out-of-the-box support for Dark and Light modes, including automatic system theme detection. It achieves flawless, bi-directional theme synchronization between the desktop shell UI and the Gemini web interface.
*   **💾 High-Fidelity Chat Export**: While in an active chat session, export the entire conversation into **HTML**, **PDF**, or **Word (Doc)** formats with a single click. It automatically converts and embeds remote images into Base64 format for reliable offline viewing.
*   **⌨️ Native Shortcuts & Tray Integration**:
    *   `CmdOrCtrl + Shift + Space`: Globally toggle (Show/Hide) the application window.
    *   `CmdOrCtrl + = / - / 0`: Flexibly zoom in, zoom out, or reset the interface scaling.
    *   `CmdOrCtrl + Shift + M`: Easily show or hide the application title bar/menu bar.
    *   **System Tray Companion**: Stays running in the background with customizable "Minimize to Tray on Close" behavior to avoid accidental loss of workspace.

---

## 🛠️ Tech Stack

*   **Core**: Electron 39.x
*   **Runtime**: Node.js & Chromium
*   **Frontend**: Vanilla JS / CSS3 (Native CSS Variables)

---

## 🚀 Getting Started

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
![G-AI Desktop light.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/light.jpg)

![G-AI Desktop dark.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/dark.jpg)

![G-AI Desktop file.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/file.jpg)

![G-AI Desktop view.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/view.jpg)

![G-AI Desktop settings.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/settings.jpg)

![G-AI Desktop multiple-files.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/multiple-files.jpg)

![G-AI Desktop export-g-ai.jpg](https://raw.githubusercontent.com/shalahu/g-ai-desktop/refs/heads/main/assets/export-g-ai.jpg)

## ❤️ Acknowledgements & Disclaimer

### 🌟 Acknowledgements
1.  **[gemini-desktop](https://github.com/bwendell/gemini-desktop)**: The core inspiration and architectural vision of this project were deeply inspired by the excellent open-source project [bwendell/gemini-desktop](https://github.com/bwendell/gemini-desktop). Huge thanks to the original author!
2.  **Google AI**: Heartfelt thanks to Google AI for providing invaluable technical assistance, code optimization recommendations, and creative support throughout the development process.

### ⚠️ Disclaimer
*   **Third-Party Software**: This is a **purely independent, third-party open-source desktop wrapper**.
*   **No Affiliation with Google**: This project and its developers are **NOT officially affiliated with, endorsed by, or in any way connected to Google Inc.** 
*   **Content & Copyright**: All AI chat interfaces, functionalities, and the "Gemini" brand assets rendered within this app belong entirely to Google. This client merely provides a local multi-tab container to enhance your desktop productivity.

---

## 📄 License

This project is open-sourced under the [MIT License](LICENSE.txt).