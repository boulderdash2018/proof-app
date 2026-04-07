export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'Missing API key' });

  const { placeId, fields } = req.query;
  if (!placeId) return res.status(400).json({ error: 'Missing placeId' });

  const fieldMask = fields || 'id,displayName,formattedAddress,types,rating,userRatingCount,priceLevel,nationalPhoneNumber,websiteUri,currentOpeningHours,photos,location,reviews';

  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': fieldMask,
        'Accept-Language': 'fr',
      },
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
