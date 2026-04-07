export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'Missing API key' });

  const { photoName, maxWidth } = req.query;
  if (!photoName) return res.status(400).json({ error: 'Missing photoName' });

  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth || 400}&key=${API_KEY}`;

  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) return res.status(response.status).json({ error: 'Photo fetch failed' });

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const buffer = await response.arrayBuffer();
    res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
