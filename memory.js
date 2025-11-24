import { quantumXPrompt } from "./quantumPrompt.js";

export const chatMemory = {};

export function initChatMemory(id) {
    if (!chatMemory[id]) {
        chatMemory[id] = [quantumXPrompt]; // selalu ada system prompt
    }
}

// RESET memory chat (kecuali system prompt)
export function resetChatMemory(sender) {
    if (chatMemory[sender]) {
        const systemPrompt = chatMemory[sender].find(msg => msg.role === "system");
        chatMemory[sender] = systemPrompt ? [systemPrompt] : [];
    }
}
