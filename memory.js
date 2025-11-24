import { quantumXPrompt } from "./quantumPrompt.js";
import { normalPrompt } from "./normalPrompt.js"; // pastikan ada file ini

export const chatMemory = {};

export function initChatMemory(id) {
    if (!chatMemory[id]) {
        chatMemory[id] = []; // jangan push prompt otomatis
    }
}

// RESET memory chat (kecuali system prompt)
export function resetChatMemory(sender) {
    if (chatMemory[sender]) {
        const systemPrompt = chatMemory[sender].find(msg => msg.role === "system");
        chatMemory[sender] = systemPrompt ? [systemPrompt] : [];
    }
}

// APPLY PROMPT SESUAI MODE
export function applyPromptByMode(chatId, mode = "dark") {
    if (!chatId) return;

    initChatMemory(chatId);

    // hapus system prompt lama
    chatMemory[chatId] = chatMemory[chatId].filter(m => m.role !== "system");

    // inject prompt sesuai mode
    if (mode === "dark") chatMemory[chatId].unshift(quantumXPrompt);
    else if (mode === "normal") chatMemory[chatId].unshift(normalPrompt);
}
