# DeepSeek Agent - Chrome Extension

DeepSeek Agent is a Chrome extension that provides an AI agent within a sidebar. It uses DeepSeek's API to analyze the pages you visit, extract data, and assist you with various tasks seamlessly while you browse.

## Features

- **Sidebar Integration:** Access the AI assistant directly from the Chrome sidebar without switching tabs.
- **Context-Aware Assistance:** The agent reads the current page and provides relevant summaries, data extraction, and explanations.
- **Developer & Security Tools:** Includes built-in developer options and security scanning tools (like HSTS and Mixed Content checks).
- **Customizable Interface:** Clean, responsive UI with settings for different models (e.g., DeepSeek Flash).

## Structure

- `assets/icons/`: Contains extension icons and logos.
- `js/`: Contains the extension logic (`background.js`, `content.js`, `sidebar.js`).
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
