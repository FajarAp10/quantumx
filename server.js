import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";
import { chatMemory, initChatMemory, resetChatMemory } from "./memory.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const limitsFile = path.join(process.cwd(), "limits.json");

// ===== Fungsi Baca/Tulis limits.json =====
function readLimits() {
    try {
        if (!fs.existsSync(limitsFile)) {
            fs.writeFileSync(limitsFile, JSON.stringify({}, null, 2));
            return {};
        }
        return JSON.parse(fs.readFileSync(limitsFile, "utf-8"));
    } catch {
        return {};
    }
}

function writeLimits(data) {
    fs.writeFileSync(limitsFile, JSON.stringify(data, null, 2));
}

// Hapus entry 'web-user' lama
const limits = readLimits();
if ("web-user" in limits) {
    delete limits["web-user"];
    writeLimits(limits);
}

// ===== API DASHBOARD =====
app.get("/api/users", (req, res) => {
    const limits = readLimits();
    res.json(limits); // { senderId: { name: "User-XXXX", limit: 5 } }
});

app.post("/api/setlimit", (req, res) => {
    const { id, limit } = req.body;
    if (!id || limit === undefined) return res.json({ success: false, message: "ID dan limit wajib diisi." });

    const limits = readLimits();
    if (!limits[id]) limits[id] = { name: id, limit: Number(limit) };
    else limits[id].limit = Number(limit);

    writeLimits(limits);
    res.json({ success: true, message: "Limit berhasil diperbarui!" });
});

// ===== API CHAT AI =====
app.post("/api/ai", async (req, res) => {
    const { sender, message, reset } = req.body;

    if (reset) resetChatMemory(sender);
    initChatMemory(sender);

    const limits = readLimits();

    // Jika sender baru, buat default
    if (!(sender in limits)) {
        limits[sender] = { name: `User-${sender.slice(-4)}`, limit: 5 };
        writeLimits(limits);
    }

    if (message === "") return res.json({ reply: "", remaining: limits[sender].limit, name: limits[sender].name });

    if (limits[sender].limit <= 0) {
        return res.json({ reply: "⚠️ Limit chat kamu habis. Hubungi Admin.", remaining: 0, name: limits[sender].name });
    }

    limits[sender].limit -= 1;
    writeLimits(limits);

    chatMemory[sender].push({ role: "user", content: message });
    const recentMessages = chatMemory[sender].slice(-20);

    // Model AI
    const preferredModels = [
        "moonshotai/kimi-k2-instruct",
        "moonshotai/kimi-k2-instruct-0905",
        "llama-3.1-8b-instant",
        "llama-3.3-70b-versatile",
        "meta-llama/llama-4-maverick-17b-128e-instruct"
    ];

    for (const model of preferredModels) {
        try {
            const response = await axios.post(
                "https://api.groq.com/openai/v1/chat/completions",
                { model, messages: recentMessages, temperature: 0.9, max_tokens: 8000, stream: false },
                { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" }, timeout: 25000 }
            );

            const reply = response.data.choices[0].message.content.trim();
            chatMemory[sender].push({ role: "assistant", content: reply });

            return res.json({ reply, remaining: limits[sender].limit, name: limits[sender].name });
        } catch (err) {
            if (err.response?.status === 429) continue;
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    const fallback = [
        "Server lagi penuh, tunggu sebentar...",
        "Lagi error, coba lagi ya...",
        "Tahan bentar, server padat..."
    ];

    res.json({ reply: fallback[Math.floor(Math.random() * fallback.length)], remaining: limits[sender].limit, name: limits[sender].name });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("🚀 Server berjalan di port " + PORT));
