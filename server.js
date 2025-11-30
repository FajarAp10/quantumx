// ===== API IMAGE (Gambar + Caption / Perintah) =====
app.post("/api/ai-image", async (req, res) => {
    const { sender, message, image } = req.body;
    if (!sender) return res.json({ reply: "❌ Sender wajib diisi", remaining: 0 });
    if (!image) return res.json({ reply: "❌ Tidak ada gambar yang dikirim", remaining: 0 });

    initChatMemory(sender, "image");

    // cek limit
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
        const localPath = path.join(uploadsDir, filename); // path lokal

        // === Panggil GPT-4V / GPT-4.1-mini terbaru ===
        const response = await openai.responses.create({
            model: "gpt-4.1-mini",
            input: [
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: message || "Buat caption singkat untuk gambar ini." },
                        { type: "input_image", image: fs.readFileSync(localPath) }
                    ]
                }
            ]
        });

        // Ambil teks output
        const reply = response.output_text || "❌ Gagal membuat caption.";

        chatMemory[sender].push({ role: "assistant", content: reply });

        res.json({ reply, remaining: limits[sender], model_used: "GPT-4V" });
    } catch (err) {
        console.error("❌ Error AI Image (GPT-4V):", err.message);
        res.json({ reply: "❌ Gagal memproses gambar.", remaining: limits[sender] });
    }
});
