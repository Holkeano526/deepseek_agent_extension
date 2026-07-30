# DeepSeek Agent - Chrome Extension

![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=flat&logo=javascript&logoColor=%23F7DF1E)
![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=flat&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=flat&logo=css3&logoColor=white)
![Chrome](https://img.shields.io/badge/chrome--extension-Manifest%20V3-4285F4.svg?style=flat&logo=googlechrome&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat)
![Model](https://img.shields.io/badge/model-DeepSeek_Flash-0052cc.svg?style=flat)

DeepSeek Agent is a Chrome extension that provides an AI agent within a sidebar. It uses DeepSeek's API to analyze the pages you visit, extract data, and assist you with various tasks seamlessly while you browse.

## Features

- **Sidebar Integration:** Access the AI assistant directly from the Chrome sidebar without switching tabs.
- **Context-Aware Assistance:** The agent reads the current page and provides relevant summaries, data extraction (including HLS/m3u8 video streams), and explanations.
- **Developer & Security Tools:** Includes built-in developer options, White Hat exploitation tools, and an **Adversarial Lab** for advanced testing (XSS, SSRF, JWT, SQLi).
- **Customizable Interface:** Clean, responsive UI with settings for different models (e.g., DeepSeek Flash) and markdown support with copyable code blocks.

## Structure

- `assets/icons/`: Contains extension icons and logos.
- `js/`: Contains the extension logic (`background.js`, `content.js`, `sidebar.js`) and the new security testing engine (`adversarial-engine.js`, `adversarial-payloads.js`).
- `css/`: Contains the styling for the sidebar.
- `sidebar.html`: The main entry point for the extension's side panel UI.
- `manifest.json`: The Chrome extension configuration file.

## Installation

1. Clone or download this repository.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click on the **Load unpacked** button.
5. Select the directory where you cloned/downloaded this repository.
6. The extension is now installed! You can open the side panel to start using the DeepSeek Agent.

## Usage

Once installed, click the DeepSeek Agent icon in your Chrome toolbar or open the side panel. The agent will automatically detect the page you are on and allow you to ask questions about its content, summarize it, or run specific tasks.

## Privacy & Security

This extension runs locally in your browser and communicates with the DeepSeek API. Data extraction and security tools are meant for authorized personal or professional use only.
