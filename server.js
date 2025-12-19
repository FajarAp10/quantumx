import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";
import { chatMemory, initChatMemory, resetChatMemory, getRecentMessages } from "./memory.js";
import OpenAI from "openai";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: "500mb" }));

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

// 🗑 Hapus entry 'web-user' lam
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
                messages: [{ role: "user", content: `Buat judul pendek maksimal 5 kata untuk topik ini. 
                - Jika topik cuma "hai", "halo", atau "bro", judul menjadi "Sapaan Singkat". 
                - Jika topik cuma "Gambar" bikin aja judul "Gambar misteri" atau "Menampilkan Gambar". 
                - Jangan tulis kata-kata seperti "Judul untuk topik ini". 
                - Buat judul kreatif, ringkas, dan menarik. 
                - Hanya tulis judulnya, tanpa penjelasan tambahan.
                ${message}` }],
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
app.post("/api/ai-image", async (req, res) => {
    const { sender, message, image } = req.body;
    if (!sender) return res.json({ reply: "❌ Sender wajib diisi", remaining: 0 });
    if (!image) return res.json({ reply: "❌ Tidak ada gambar yang dikirim", remaining: 0 });

    initChatMemory(sender, "image");

    const limits = readLimits();
    if (!(sender in limits)) limits[sender] = 0;
  if (limits[sender] <= 0) {
    return res.json({
        replies: [
            {
                type: "text",
                content: "⚠️ Limit chat kamu habis."
            },
            {
                type: "buttons",
                content: `
<div class="limit-buttons">
  <button onclick="window.open('https://wa.me/6283836348226?text=Halo%20admin%2C%20saya%20${encodeURIComponent(sender)}%20mau%20isi%20limit.', '_blank')">
    💬 Hubungi Admin
  </button>
</div>
`
            }
        ],
        remaining: 0
    });
}

    limits[sender] -= 1;
    writeLimits(limits);

    // Simpan gambar & dapatkan URL publik
    const filename = `img_${Date.now()}.png`;
    const imageUrl = saveBase64Image(image, filename);
    if (!imageUrl) return res.json({ reply: "❌ Format gambar salah.", remaining: limits[sender] });

    chatMemory[sender].push({ role: "user", content: message || "[User kirim gambar]", image });

    try {
        console.log(`🔄 Memproses gambar untuk sender: ${sender}, URL: ${imageUrl}`);

        // === GPT-4V terbaru: gunakan URL gambar, tanpa reasoning ===
        const response = await openai.responses.create({
            model: "gpt-4.1-mini",
            input: [
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: message || `
Kamu adalah asisten AI yang pintar banget. Analisis gambar yang dikirim.

- Jangan respon pakai tanda tanda aneh, contohnya **
- Jika gambar berisi soal (misal matematika, fisika, kimia, pilihan ganda, uraian):
  1. Jelaskan soal dengan singkat.
  2. Tulis langkah-langkah pengerjaan secara jelas.
  3. Tunjukkan rumus yang digunakan.
  4. Berikan jawaban akhir dengan benar.

- Jika gambar bukan soal, buat deskripsi gambar secara ringkas dan informatif.

- Jika ada pertanyaan tertulis di gambar, jawab dengan benar.
- Jangan menambahkan informasi yang tidak ada di gambar.
- Tulis output dengan bahasa Indonesia yang jelas dan mudah dipahami.
`},
                        { type: "input_image", image_url: imageUrl }
                    ]
                }
            ]
        });

        // Ambil teks jawaban
        let reply = "";
        if (response.output?.length) {
            for (const msg of response.output) {
                if (msg.content?.length) {
                    for (const c of msg.content) {
                        if (c.type === "output_text") reply += c.text;
                    }
                }
            }
        }
        if (!reply) reply = "❌ Gagal membuat caption.";

        // simpan jawaban GPT (tetap)
        chatMemory[sender].push({ role: "assistant", content: reply });

        // 🔥 TAMBAHAN PENTING (INI KUNCINYA)
      chatMemory[sender].push({
  role: "system",
  content: `Deskripsi gambar sebelumnya: ${reply}`
});



        console.log(`✅ Model GPT-4V berhasil untuk sender: ${sender}`);

        res.json({ reply, remaining: limits[sender], model_used: "GPT-4V" });

    } catch (err) {
        console.error("❌ Error AI Image (GPT-4V):", err.message);
        res.json({ reply: "❌ Gagal memproses gambar.", remaining: limits[sender] });
    }
});

app.post("/api/ai", async (req, res) => {
    const { sender, message, reset, mode } = req.body;

    if (reset) resetChatMemory(sender, mode);
    initChatMemory(sender, mode);

    const limits = readLimits();
    if (!(sender in limits)) limits[sender] = 0;

    if (!message) return res.json({ reply: "", remaining: limits[sender] });
    if (limits[sender] <= 0) {
    return res.json({
        replies: [
            {
                type: "text",
                content: "⚠️ Limit chat kamu habis."
            },
            {
                type: "buttons",
         content: `
<div class="limit-buttons">
  <button onclick="window.open('https://wa.me/6283836348226?text=Halo%20admin%2C%20saya%20${encodeURIComponent(sender)}%20mau%20isi%20limit.', '_blank')">
    💬 Hubungi Admin
  </button>
</div>
`

            }
        ],
        remaining: 0
    });
}




    limits[sender] -= 1;
    writeLimits(limits);

    // push user message ke memory (mode untuk UI, tapi jangan kirim ke Groq)
    chatMemory[sender].push({ role: "user", content: message });

    const recentMessages = getRecentMessages(sender, 5)
  .filter(m => typeof m.content === "string")
  .map(m => ({
    role: m.role === "bot" ? "assistant" : m.role,
    content: m.content
  }));


    const preferredModels = [
        "moonshotai/kimi-k2-instruct",
        "moonshotai/kimi-k2-instruct-0905",
        "llama-3.1-8b-instant",
        "llama-3.3-70b-versatile",
        "meta-llama/llama-4-maverick-17b-128e-instruct"
    ];

    for (const model of preferredModels) {
        try {

            console.log(`💬 User (${sender}): ${message}`);
            console.log(`🔄 Mencoba model: ${model}`);

            const response = await axios.post(
                "https://api.groq.com/openai/v1/chat/completions",
                { model, messages: recentMessages, temperature: 0.9, max_tokens: 5000, stream: false },
                { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" }, timeout: 25000 }
            );

            const reply = response.data.choices[0].message.content.trim();
            chatMemory[sender].push({ role: "assistant", content: reply });

               // ✅ Log berhasil pakai model
            console.log(`✅ Model berhasil: ${model}`);


            return res.json({ reply, remaining: limits[sender], model_used: model, mode });
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
    res.json({ reply: fallback[Math.floor(Math.random() * fallback.length)], remaining: limits[sender], mode });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log("🚀 Server berjalan di port " + PORT);
});
