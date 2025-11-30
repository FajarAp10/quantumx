import { quantumXPrompt } from "./quantumPrompt.js";
import { normalPrompt } from "./normalPrompt.js";

export const chatMemory = {};

export function initChatMemory(id, mode = "dark") {
  if (!chatMemory[id]) {
    chatMemory[id] = [mode === "dark" ? quantumXPrompt : normalPrompt];
  }
}

export function resetChatMemory(sender, mode = "normal") {
  if (!chatMemory[sender]) chatMemory[sender] = [];
  chatMemory[sender] = [mode === "dark" ? quantumXPrompt : normalPrompt];
}
