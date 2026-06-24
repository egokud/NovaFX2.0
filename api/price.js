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
      const { secret, symbol, bid, ask, spread, time, day_high, day_low } = body;
      if (secret !== process.env.CRON_SECRET) return res.status(403).json({ error: 'forbidden' });

      const data = { symbol, bid, ask, spread, time, day_high, day_low, updated: new Date().toISOString() };

      await fetch(`${kvUrl}/set/eurusd_price/${encodeURIComponent(JSON.stringify(data))}`, {
        headers: { Authorization: `Bearer ${kvToken}` }
      });

      return res.status(200).json({ ok: true, data });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=60');
    const r = await fetch(`${kvUrl}/get/eurusd_price`, {
      headers: { Authorization: `Bearer ${kvToken}` }
    });
    const d = await r.json();
    return res.status(200).json(d.result ? JSON.parse(d.result) : null);
  }

  return res.status(405).json({ error: 'method not allowed' });
}
