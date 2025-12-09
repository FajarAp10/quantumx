import { quantumXPrompt } from "./quantumPrompt.js";
import { normalPrompt } from "./normalPrompt.js";

export const chatMemory = {};

export function initChatMemory(id, mode = "normal") {
    if (!chatMemory[id]) {
        chatMemory[id] = [
            { role: "system", content: mode === "dark" ? quantumXPrompt : normalPrompt }
        ];
    }
}

export function resetChatMemory(id, mode = "normal") {
    chatMemory[id] = [
        { role: "system", content: mode === "dark" ? quantumXPrompt : normalPrompt }
    ];
}

export function getRecentMessages(id, count = 5) {
    if (!chatMemory[id]) return [];

    // Ambil sistem prompt dulu
    const systemMsg = chatMemory[id][0];

    // Ambil chat terbaru TAPI tidak boleh ambil index 0 lagi
    const historyOnly = chatMemory[id]
        .slice(1)            // buang system prompt
        .slice(-count);      // ambil N pesan terakhir

    return [systemMsg, ...historyOnly];
}
