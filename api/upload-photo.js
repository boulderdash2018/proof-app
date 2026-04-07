import { put } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageData } = req.body;
    if (!imageData) return res.status(400).json({ error: 'Missing imageData' });

    // Remove data:image/...;base64, prefix
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const filename = `plans/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;

    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: 'image/jpeg',
    });

    res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
}
