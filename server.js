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

// ===== LIMITS GLOBAL =====
const limitsFile = path.join(process.cwd(), "limits.json");

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

// 🗑 Hapus entry 'web-user' lama (jalankan sekali saat server start)
const limits = readLimits();
if ("web-user" in limits) {
    delete limits["web-user"];
    writeLimits(limits);
    console.log("🗑 Entry 'web-user' dihapus");
}


// ==========================================================
// 🔥 API DASHBOARD (OBJECT FORMAT)
// ==========================================================
app.get("/api/users", (req, res) => {
    const limits = readLimits();
    res.json(limits); // IMPORTANT: KIRIM OBJECT
});

app.post("/api/setlimit", (req, res) => {
    const { id, limit } = req.body;

    if (!id || limit === undefined) {
        return res.json({ success: false, message: "ID dan limit wajib diisi." });
    }

    const limits = readLimits();
    limits[id] = Number(limit);
    writeLimits(limits);

    res.json({ success: true, message: "Limit berhasil diperbarui!" });
});

app.post("/api/generate-title", async (req, res) => {
    const { message } = req.body;

    try {
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "user", content: `Buatkan judul pendek (maks 5 kata) untuk topik ini: ${message}` }
                ],
                max_tokens: 20,
                temperature: 0.2
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const title = response.data.choices[0].message.content.trim();
        res.json({ title });

    } catch (err) {
        res.json({ title: "Obrolan Baru" });
    }
});


// ==========================================================
// 🔥 API CHAT AI
// ==========================================================
app.post("/api/ai", async (req, res) => {
    const { sender, message, reset } = req.body;

    if (reset) resetChatMemory(sender);
    initChatMemory(sender);

    const limits = readLimits();
    if (!(sender in limits)) limits[sender] = 5;

    if (message === "") return res.json({ reply: "", remaining: limits[sender] });

    if (limits[sender] <= 0) {
        return res.json({ reply: "⚠️ Limit chat kamu sudah habis.", remaining: 0 });
    }

    limits[sender] -= 1;
    writeLimits(limits);

    chatMemory[sender].push({ role: "user", content: message });
    const recentMessages = chatMemory[sender].slice(-20);

    const preferredModels = [
        "moonshotai/kimi-k2-instruct",
        "moonshotai/kimi-k2-instruct-0905",
        "llama-3.1-8b-instant",
        "llama-3.3-70b-versatile",
        "meta-llama/llama-4-maverick-17b-128e-instruct"
    ];
for (const model of preferredModels) {
    try {
        console.log(`🔄 Mencoba model: ${model}`);

        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model,
                messages: recentMessages,
                temperature: 0.9,
                max_tokens: 8000,
                stream: false
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                },
                timeout: 25000
            }
        );

        // 🟢 Jika sukses — log model berhasil
        console.log(`✅ Model berhasil: ${model}`);

        const reply = response.data.choices[0].message.content.trim();
        chatMemory[sender].push({ role: "assistant", content: reply });

        return res.json({
            reply,
            remaining: limits[sender],
            model_used: model   // optional: biar tahu model mana yg dipakai
        });

    } catch (err) {
        console.log(`❌ Model gagal ${model}:`, err.response?.status || err.message);

        // Kalau error 429 → langsung lanjut model lain
        if (err.response?.status === 429) continue;

        // Kalau error lain → delay dulu biar ga spam server
        await new Promise(r => setTimeout(r, 2000));
    }
}

    const fallback = [
        "Server lagi penuh, tunggu sebentar...",
        "Lagi error, coba lagi ya...",
        "Tahan bentar, server padat..."
    ];

    res.json({ reply: fallback[Math.floor(Math.random() * fallback.length)], remaining: limits[sender] });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log("🚀 Server berjalan di port " + PORT);
});
