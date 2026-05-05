// Vercel proxy for Google Maps Static API.
//
// Why a proxy? Same pattern as places-photo.js:
//   1. The API key never leaves the server (no client-side leak).
//   2. We control which params are accepted (no abuse).
//   3. Same-origin response avoids any CORS / referer-restriction edge case
//      that direct browser calls to maps.googleapis.com sometimes hit.
//
// Usage from the client:
//   /api/static-map?lat=43.4929&lng=-1.4748&w=600&h=360
//
// Returns: image/png (or whatever Google returns) with 24h cache.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'Missing API key' });

  const { lat, lng, w, h, zoom } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'Missing lat/lng' });
  }

  // Sanitize numeric inputs — clamp to Static Maps limits (640x640 max
  // logical, 2x scale → 1280x1280 actual, well within the free-tier ceiling).
  const safeW = Math.min(640, Math.max(64, parseInt(w, 10) || 600));
  const safeH = Math.min(640, Math.max(64, parseInt(h, 10) || 360));
  const safeZoom = Math.min(20, Math.max(1, parseInt(zoom, 10) || 15));

  const url =
    `https://maps.googleapis.com/maps/api/staticmap?` +
    `center=${encodeURIComponent(lat)},${encodeURIComponent(lng)}` +
    `&zoom=${safeZoom}&size=${safeW}x${safeH}&scale=2` +
    `&markers=color:0xC4704B%7C${encodeURIComponent(lat)},${encodeURIComponent(lng)}` +
    `&style=feature:poi%7Cvisibility:simplified` +
    `&key=${API_KEY}`;

  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      // Static Maps returns 403 when the API isn't enabled on the project,
      // or 400 for bad params. Surface the status so the client can show a
      // sensible fallback.
      return res
        .status(response.status)
        .json({ error: 'Static Maps fetch failed', status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h CDN cache

    const buffer = await response.arrayBuffer();
    res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
