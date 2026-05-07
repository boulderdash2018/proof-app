// Vercel proxy générique pour servir une image distante avec les bons
// headers CORS.
//
// Pourquoi : Firebase Storage ne renvoie pas par défaut le header
// Access-Control-Allow-Origin sur ses URLs publiques. Conséquence : un
// `fetch()` côté browser depuis notre app web (proof-app-black.vercel.app)
// vers une URL firebasestorage.googleapis.com échoue en CORS, ce qui empêche
// de télécharger une photo via blob → object URL.
//
// Plutôt que de configurer CORS sur le bucket Firebase (gsutil + cors.json,
// nécessite un re-deploy à chaque update), on passe l'image par notre propre
// proxy. Same-origin avec l'app web → pas de CORS à gérer côté browser.
//
// Usage :
//   /api/proxy-image?url=<URL encodée>
//
// Sécurité : on n'autorise QUE les hosts whitelistés (Firebase Storage de ce
// projet) pour éviter qu'un attaquant transforme notre proxy en SSRF/abuse.

const ALLOWED_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url query param' });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid url' });
  }
  if (!ALLOWED_HOSTS.has(parsed.host)) {
    return res.status(403).json({ error: 'Host not allowed' });
  }

  try {
    const response = await fetch(parsed.toString(), { redirect: 'follow' });
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Upstream fetch failed', status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    // Cache CDN 1h — l'URL contient déjà le token de download Firebase qui
    // sert d'invalidant naturel si le fichier est révoqué.
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const buffer = await response.arrayBuffer();
    res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
