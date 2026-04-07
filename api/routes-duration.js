export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'Missing API key' });

  const { originPlaceId, destinationPlaceId, travelMode } = req.body;
  if (!originPlaceId || !destinationPlaceId) {
    return res.status(400).json({ error: 'Missing origin or destination' });
  }

  const body = {
    origin: { placeId: originPlaceId },
    destination: { placeId: destinationPlaceId },
    travelMode: travelMode || 'WALK',
    languageCode: 'fr',
  };

  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'routes.duration',
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
