import { quantumXPrompt } from "./quantumPrompt.js";
import { normalPrompt } from "./normalPrompt.js";

export const chatMemory = {};

export function initChatMemory(id, mode = "dark") {
    if (!chatMemory[id]) {
        // pakai system prompt sesuai mode
        chatMemory[id] = [mode === "dark" ? quantumXPrompt : normalPrompt];
    }
}

// RESET memory chat (kecuali system prompt)
export function resetChatMemory(sender, mode = "dark") {
    if (chatMemory[sender]) {
        const systemPrompt = chatMemory[sender].find(msg => msg.role === "system");
        chatMemory[sender] = systemPrompt ? [systemPrompt] : [];
        // override system prompt sesuai mode baru
        chatMemory[sender][0] = mode === "dark" ? quantumXPrompt : normalPrompt;
    }
}

// GANTI prompt aktif ke mode lain
export function switchSystemPrompt(sender, mode = "dark") {
    if (chatMemory[sender] && chatMemory[sender].length > 0) {
        const systemIndex = chatMemory[sender].findIndex(msg => msg.role === "system");
        if (systemIndex !== -1) {
            chatMemory[sender][systemIndex] = mode === "dark" ? quantumXPrompt : normalPrompt;
        } else {
            // kalau belum ada system prompt, tambahkan
            chatMemory[sender].unshift(mode === "dark" ? quantumXPrompt : normalPrompt);
        }
    }
}
