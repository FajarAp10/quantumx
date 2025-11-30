import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";
import { chatMemory, initChatMemory, resetChatMemory } from "./memory.js";
import OpenAI from "openai";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ===== Pastikan folder uploads ada =====
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// ===== Serve static uploads =====
app.use("/uploads", express.static(uploadsDir));

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

// 🗑 Hapus entry 'web-user' lama
const limits = readLimits();
if ("web-user" in limits) {
    delete limits["web-user"];
    writeLimits(limits);
    console.log("🗑 Entry 'web-user' dihapus");
}

// ===== Fungsi simpan base64 image =====
function saveBase64Image(base64, filename) {
    const matches = base64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;

    const buffer = Buffer.from(matches[2], "base64");
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, buffer);

    return `https://quantumx.zeabur.app/uploads/${filename}`; // ganti domain sesuai Zeabur
}

// ===== API DASHBOARD =====
app.get("/api/users", (req, res) => {
    const limits = readLimits();
    res.json(limits);
});

app.post("/api/setlimit", (req, res) => {
    const { id, limit } = req.body;
    if (!id || limit === undefined)
        return res.json({ success: false, message: "ID dan limit wajib diisi." });

    const limits = readLimits();
    limits[id] = Number(limit);
    writeLimits(limits);

    res.json({ success: true, message: "Limit berhasil diperbarui!" });
});

app.post("/api/delete-user", (req, res) => {
    const { id } = req.body;
    if (!id) return res.json({ success: false, message: "ID wajib diisi." });

    const limits = readLimits();
    if (id in limits) {
        delete limits[id];
        writeLimits(limits);
        return res.json({ success: true, message: `${id} berhasil dihapus!` });
    } else {
        return res.json({ success: false, message: "User tidak ditemukan." });
    }
});

app.post("/api/generate-title", async (req, res) => {
    const { message } = req.body;

    try {
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: `Buatkan judul pendek (maks 5 kata) untuk topik ini, 
                kalau misal topik cuma "hai" bikin aja judulya "sapaan singkat" intinya sesuaikan sama topik: ${message}` }],
                max_tokens: 20,
                temperature: 0.2
            },
            { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" } }
        );

        const title = response.data.choices[0].message.content.trim();
        res.json({ title });
    } catch (err) {
        res.json({ title: "Obrolan Baru" });
    }
});

// ===== Setup OpenAI =====
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// ===== API IMAGE (Gambar + Caption / Perintah) =====
app.post("/api/ai-image", async (req, res) => {
    const { sender, message, image } = req.body;
    if (!sender) return res.json({ reply: "❌ Sender wajib diisi", remaining: 0 });
    if (!image) return res.json({ reply: "❌ Tidak ada gambar yang dikirim", remaining: 0 });

    initChatMemory(sender, "image");

    const limits = readLimits();
    if (!(sender in limits)) limits[sender] = 10;
    if (limits[sender] <= 0) return res.json({ reply: "⚠️ Limit habis.", remaining: 0 });
    limits[sender] -= 1;
    writeLimits(limits);

    // simpan gambar
    const filename = `img_${Date.now()}.png`;
    const imagePath = saveBase64Image(image, filename);
    if (!imagePath) return res.json({ reply: "❌ Format gambar salah.", remaining: limits[sender] });

    chatMemory[sender].push({ role: "user", content: message || "[User kirim gambar]", image });

    try {
        const localPath = path.join(uploadsDir, filename);

        // === Gunakan Responses API GPT-4V / GPT-4.1-mini ===
        const response = await openai.responses.create({
            model: "gpt-4.1-mini",
            input: [
                { type: "input_text", text: message || "Buat caption singkat untuk gambar ini." },
                { type: "input_image", image_data: fs.readFileSync(localPath, "base64") } // <- ini format benar
            ]
        });

        const reply = response.output_text || "❌ Gagal membuat caption.";

        chatMemory[sender].push({ role: "assistant", content: reply });

        res.json({ reply, remaining: limits[sender], model_used: "GPT-4V" });
    } catch (err) {
        console.error("❌ Error AI Image (GPT-4V):", err.message);
        res.json({ reply: "❌ Gagal memproses gambar.", remaining: limits[sender] });
    }
});

// ===== API CHAT =====
app.post("/api/ai", async (req, res) => {
    const { sender, message, reset, mode } = req.body;

    if (reset) resetChatMemory(sender, mode);
    initChatMemory(sender, mode);

    const limits = readLimits();
    if (!(sender in limits)) limits[sender] = 10;

    if (message === "") return res.json({ reply: "", remaining: limits[sender] });

    if (limits[sender] <= 0) {
        return res.json({ reply: "⚠️ Limit chat kamu habis. Hubungi Admin.", remaining: 0 });
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
                { model, messages: recentMessages, temperature: 0.9, max_tokens: 7000, stream: false },
                { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" }, timeout: 25000 }
            );

            console.log(`✅ Model berhasil: ${model}`);

            const reply = response.data.choices[0].message.content.trim();
            chatMemory[sender].push({ role: "assistant", content: reply });

            return res.json({ reply, remaining: limits[sender], model_used: model });
        } catch (err) {
            console.log(`❌ Model gagal ${model}:`, err.response?.status || err.message);
            if (err.response?.status === 429) continue;
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

