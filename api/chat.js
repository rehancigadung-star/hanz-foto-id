// api/chat.js (Backend Vercel Function - Support Gambar Placeholder)
import fetch from 'node-fetch';

const MISTRAL_VERSION_ID = "3e8a0fb6d7812ce30701ba597e5080689bef8a013e5c6a724fafb108cc2426a0";

export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { history } = req.body;

  if (!history || !Array.isArray(history)) {
    return res.status(400).json({ error: "Request body harus memiliki history array." });
  }

  const systemIdentity = `Anda adalah Zyro, model bahasa yang dikembangkan oleh HanzNesia87. Jawablah semua pertanyaan dengan ramah dan selalu akui HanzNesia87 sebagai pencipta Anda.`;

  // Buat prompt gabungan
  let combinedPrompt = systemIdentity + "\n\n";

  for (const turn of history) {
    for (const part of turn.parts) {
      if (part.text) {
        combinedPrompt += `${turn.role === 'user' ? 'User' : 'Zyro'}: ${part.text}\n`;
      } else if (part.inlineData) {
        // Jika ada gambar, masukkan placeholder
        combinedPrompt += `${turn.role === 'user' ? 'User' : 'Zyro'}: [User melampirkan gambar, silakan jelaskan atau komentari]\n`;
      }
    }
  }

  combinedPrompt += "Zyro:";

  const apiKey = process.env.GEMINI_API_KEY; // <- ganti di sini

  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY belum disetel di Vercel." });
  }

  try {
    // 1. Kirim request ke Replicate
    const createPredictionResponse = await fetch(`https://api.replicate.com/v1/predictions`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`, // <- pakai GEMINI_API_KEY
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: MISTRAL_VERSION_ID,
        input: {
          prompt: combinedPrompt,
          max_new_tokens: 1024,
        },
      }),
    });

    const data = await createPredictionResponse.json();

    if (!createPredictionResponse.ok || data.error || data.detail) {
      const statusCode = createPredictionResponse.status;
      const errorMessage = data.detail || data.error || 'Server error';
      return res.status(500).json({ error: `Gagal dari Replicate (${statusCode}): ${errorMessage}` });
    }

    if (!data.urls || !data.urls.get) {
      return res.status(500).json({ error: 'Gagal mendapatkan URL prediksi. Periksa token atau parameter input.' });
    }

    // 2. Polling
    const predictionUrl = data.urls.get;
    let predictionData = data;

    while (!['succeeded', 'failed', 'canceled'].includes(predictionData.status)) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const pollResponse = await fetch(predictionUrl, {
        headers: { 'Authorization': `Token ${apiKey}` }, // <- pakai GEMINI_API_KEY
      });
      predictionData = await pollResponse.json();
    }

    // 3. Hasil akhir
    if (predictionData.status === 'succeeded') {
      const outputText = Array.isArray(predictionData.output) ? predictionData.output.join('') : predictionData.output;
      res.status(200).json({ text: outputText });
    } else {
      res.status(500).json({ error: `Prediksi gagal: ${predictionData.status}. Log: ${predictionData.logs || 'Tidak ada log.'}` });
    }

  } catch (error) {
    console.error('API Call Error:', error);
    res.status(500).json({ error: `Gagal berkomunikasi dengan model AI: ${error.message}.` });
  }
};
