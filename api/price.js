export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'POST') {
    const { secret, symbol, bid, ask, spread, time } = req.body;
    if (secret !== process.env.CRON_SECRET) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const data = { symbol, bid, ask, spread, time, updated: new Date().toISOString() };
    const token = process.env.GITHUB_PAT;
    const getRes = await fetch('https://api.github.com/repos/egokud/NovaFX2.0/contents/data.json', {
      headers: { Authorization: `token ${token}` }
    });
    const getData = await getRes.json();
    const current = JSON.parse(Buffer.from(getData.content, 'base64').toString());
    current.price = data;
    const putRes = await fetch('https://api.github.com/repos/egokud/NovaFX2.0/contents/data.json', {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'price update from MT5', content: Buffer.from(JSON.stringify(current, null, 2)).toString('base64'), sha: getData.sha })
    });
    return putRes.ok ? res.status(200).json({ ok: true, data }) : res.status(500).json({ error: 'github write failed' });
  }

  if (req.method === 'GET') {
    const token = process.env.GITHUB_PAT;
    const getRes = await fetch('https://api.github.com/repos/egokud/NovaFX2.0/contents/data.json', {
      headers: { Authorization: `token ${token}` }
    });
    const getData = await getRes.json();
    const current = JSON.parse(Buffer.from(getData.content, 'base64').toString());
    return res.status(200).json(current.price || null);
  }

  return res.status(405).json({ error: 'method not allowed' });
}