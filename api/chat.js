// api/chat.js — Backend Vercel Serverless Function
// SUPPORT TEXT + GAMBAR (placeholder)

const MISTRAL_VERSION_ID = "3e8a0fb6d7812ce30701ba597e5080689bef8a013e5c6a724fafb108cc2426a0";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send("Method Not Allowed");
  }

  const { history } = req.body;

  if (!history || !Array.isArray(history)) {
    return res.status(400).json({ error: "Request body harus memiliki history array." });
  }

  // System Prompt
  const systemIdentity = `
Anda adalah Zyro, model AI yang dibuat oleh HanzNesia87.
Jawablah dengan ramah, informatif, dan selalu mengakui HanzNesia87 sebagai pencipta Anda.
  `;

  // Gabungkan prompt
  let combinedPrompt = systemIdentity + "\n\n";

  for (const turn of history) {
    for (const part of turn.parts) {
      if (part.text) {
        combinedPrompt += `${turn.role === "user" ? "User" : "Zyro"}: ${part.text}\n`;
      } else if (part.inlineData) {
        combinedPrompt += `${turn.role === "user" ? "User" : "Zyro"}: [User mengirim gambar]\n`;
      }
    }
  }

  combinedPrompt += "\nZyro:";

  // Ambil token dari Vercel
  const apiKey = process.env.REPLICATE_API_TOKEN;

  if (!apiKey) {
    return res.status(500).json({ error: "REPLICATE_API_TOKEN belum disetel di Vercel." });
  }

  try {
    // Kirim ke Replicate
    const predictionResponse = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        version: MISTRAL_VERSION_ID,
        input: {
          prompt: combinedPrompt,
          max_new_tokens: 1024
        }
      })
    });

    const predictionData = await predictionResponse.json();

    if (!predictionResponse.ok || predictionData.error || predictionData.detail) {
      return res.status(500).json({
        error: `Gagal dari Replicate (${predictionResponse.status}): ${
          predictionData.detail || predictionData.error || "Server error"
        }`
      });
    }

    if (!predictionData.urls || !predictionData.urls.get) {
      return res.status(500).json({
        error: "Gagal mendapatkan URL prediksi dari Replicate."
      });
    }

    // Polling sampai selesai
    let finalData = predictionData;

    while (!["succeeded", "failed", "canceled"].includes(finalData.status)) {
      await new Promise((r) => setTimeout(r, 1200));

      const poll = await fetch(finalData.urls.get, {
        headers: { "Authorization": `Token ${apiKey}` }
      });

      finalData = await poll.json();
    }

    if (finalData.status === "succeeded") {
      const output =
        Array.isArray(finalData.output) ? finalData.output.join("") : finalData.output;

      return res.status(200).json({ text: output });
    }

    return res.status(500).json({
      error: `Prediksi gagal: ${finalData.status}. Log: ${finalData.logs || "Tidak ada log."}`
    });

  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: `Kesalahan Koneksi API: ${err.message}` });
  }
}
