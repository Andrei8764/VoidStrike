import { devConsoleOutputElement } from "./dom.js";

export function appendConsoleLine(text) {
    if (!devConsoleOutputElement) {
        return;
    }

    const line = document.createElement("div");
    line.textContent = text;
    devConsoleOutputElement.appendChild(line);
    devConsoleOutputElement.scrollTop = devConsoleOutputElement.scrollHeight;
}
