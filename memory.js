import { quantumXPrompt } from "./quantumPrompt.js";
import { normalPrompt } from "./normalPrompt.js";

export const chatMemory = {};
export const basePromptMap = {};  // pisahkan base prompt


export function initChatMemory(id, mode = "normal") {
    if (!chatMemory[id]) chatMemory[id] = [];

    basePromptMap[id] = mode === "dark" ? quantumXPrompt : normalPrompt;
}


export function resetChatMemory(id, mode = "normal") {
    chatMemory[id] = [];
    basePromptMap[id] = mode === "dark" ? quantumXPrompt : normalPrompt;
}

