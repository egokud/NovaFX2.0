// Hourly cron — auto-updates EUR/USD price silently
export const config = { runtime: 'edge' };

const GITHUB_TOKEN = typeof process !== 'undefined' ? process.env.GITHUB_TOKEN : '';

async function updatePrice() {
  const r = await fetch('https://api.github.com/repos/egokud/NovaFX2.0/contents/data.json',
    { headers: { 'Authorization': 'token ' + GITHUB_TOKEN } });
  const d = await r.json();

  const pr = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD');
  const pd = await pr.json();
  const rate = pd.rates.USD.toFixed(5);

  const now = new Date();
  const nowISO = now.toISOString().slice(0,19) + 'Z';
  const nowStr = now.getUTCDate() + ' '
    + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getUTCMonth()] + ' '
    + now.getUTCFullYear() + ', '
    + String(now.getUTCHours()).padStart(2,'0') + ':' + String(now.getUTCMinutes()).padStart(2,'0') + ' GMT';

  const raw = atob(d.content.replace(/\n/g,''));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const current = JSON.parse(new TextDecoder('utf-8').decode(bytes));

  current.updated = nowISO;
  current.updated_ru = nowStr;
  current.price.rate = rate;
  current.price.source = 'ECB/Frankfurter';

  const jsonStr = JSON.stringify(current, null, 2);
  const encoded = new TextEncoder().encode(jsonStr);
  let binary = '';
  for (let i = 0; i < encoded.length; i += 8192) {
    binary += String.fromCharCode.apply(null, encoded.subarray(i, i + 8192));
  }
  const b64 = btoa(binary);

  await fetch('https://api.github.com/repos/egokud/NovaFX2.0/contents/data.json',
    { method:'PUT', headers:{'Authorization':'token '+GITHUB_TOKEN,'Content-Type':'application/json'},
      body: JSON.stringify({ message: 'Cron update ' + nowISO, content: b64, sha: d.sha }) });
}

export default async function handler(req) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date();
  const hour = now.getUTCHours();
  if (hour < 6 || hour > 22) {
    return new Response('Outside trading hours', { status: 200 });
  }

  await updatePrice();
  return new Response('Updated', { status: 200 });
}
