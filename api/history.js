export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const kvUrl   = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (req.method === 'POST') {
    try {
      const raw = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
      const body = JSON.parse(raw);
      const { secret, candles } = body;
      if (secret !== process.env.CRON_SECRET) return res.status(403).json({ error: 'forbidden' });
      if (!Array.isArray(candles) || candles.length === 0) return res.status(400).json({ error: 'no candles' });

      await fetch(`${kvUrl}/set/eurusd_history/${encodeURIComponent(JSON.stringify(candles))}`, {
        headers: { Authorization: `Bearer ${kvToken}` }
      });

      return res.status(200).json({ ok: true, count: candles.length });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'GET') {
    const r = await fetch(`${kvUrl}/get/eurusd_history`, {
      headers: { Authorization: `Bearer ${kvToken}` }
    });
    const d = await r.json();
    return res.status(200).json(d.result ? JSON.parse(d.result) : []);
  }

  return res.status(405).json({ error: 'method not allowed' });
}
