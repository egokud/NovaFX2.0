export const config = { api: { bodyParser: false } };

const FLAGS = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  CHF: '🇨🇭', CAD: '🇨🇦', AUD: '🇦🇺', NZD: '🇳🇿', CNY: '🇨🇳'
};

const ALLOWED_CURRENCIES = ['USD', 'EUR'];
const ALLOWED_IMPACT = ['High', 'Medium'];

const CRON_SECRET = process.env.CRON_SECRET || 'novafx2026';

// Чтение тела запроса (raw)
function readBody(req) {
  return new Promise(function(resolve, reject) {
    var chunks = [];
    req.on('data', function(c){ chunks.push(c); });
    req.on('end', function(){
      try {
        var raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw);
      } catch(e) { reject(e); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var kvUrl = process.env.KV_REST_API_URL;
  var kvToken = process.env.KV_REST_API_TOKEN;

  // POST — приём данных от MT5 → Python
  if (req.method === 'POST') {
    var auth = req.headers['authorization'] || '';
    if (auth !== 'Bearer ' + CRON_SECRET) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    try {
      var raw = await readBody(req);
      var body = JSON.parse(raw);
      if (!body.events || !Array.isArray(body.events)) {
        return res.status(400).json({ error: 'events array required' });
      }

      // Фильтруем и нормализуем входные события из MT5
      var events = body.events
        .map(function(ev){
          var currency = String(ev.currency || '').toUpperCase();
          var impactRaw = String(ev.impact || '').toLowerCase();
          var impact = 'Low';
          if (impactRaw.indexOf('high') >= 0) impact = 'High';
          else if (impactRaw.indexOf('medium') >= 0 || impactRaw.indexOf('moderate') >= 0) impact = 'Medium';

          return {
            currency: currency,
            flag: FLAGS[currency] || '🌐',
            name: String(ev.name || ''),
            date: String(ev.date || ''),
            actual: ev.actual !== undefined ? ev.actual : null,
            forecast: ev.forecast !== undefined ? ev.forecast : null,
            previous: ev.previous !== undefined ? ev.previous : null,
            impact: impact
          };
        })
        .filter(function(ev){
          return ALLOWED_CURRENCIES.indexOf(ev.currency) >= 0
              && ALLOWED_IMPACT.indexOf(ev.impact) >= 0
              && ev.name && ev.date;
        });

      var payload = {
        events: events,
        ts: Date.now(),
        count: events.length,
        source: 'mt5'
      };

      try {
        await fetch(kvUrl + '/set/calendar_events/' + encodeURIComponent(JSON.stringify(payload)), {
          headers: { Authorization: 'Bearer ' + kvToken }
        });
      } catch (e) {
        return res.status(500).json({ error: 'cache write failed: ' + e.message });
      }

      return res.status(200).json({ ok: true, count: events.length });
    } catch (e) {
      return res.status(400).json({ error: 'bad request: ' + e.message });
    }
  }

  // GET — отдаём кешированные данные
  if (req.method === 'GET') {
    try {
      var r = await fetch(kvUrl + '/get/calendar_events', {
        headers: { Authorization: 'Bearer ' + kvToken }
      });
      var d = await r.json();
      if (d.result) {
        var cached = JSON.parse(d.result);
        var age = Date.now() - cached.ts;
        return res.status(200).json({
          events: cached.events,
          count: cached.count,
          source: cached.source || 'unknown',
          age_minutes: Math.round(age / 60000),
          ts: cached.ts
        });
      }
      return res.status(200).json({ events: [], count: 0, source: 'empty' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'method not allowed' });
}
