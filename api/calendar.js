export const config = { api: { bodyParser: false } };

const JB_API_KEY = process.env.JB_API_KEY || 'xgj3wKJfTtWZ6cBGvns01UFIWaATrF51';
const JB_URL = 'https://www.jblanked.com/news/api/mql5/calendar/week/';

// Перевод названий валют в флаги
const FLAGS = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  CHF: '🇨🇭', CAD: '🇨🇦', AUD: '🇦🇺', NZD: '🇳🇿', CNY: '🇨🇳'
};

// Только эти валюты показываем (фокус на EUR/USD)
const ALLOWED_CURRENCIES = ['USD', 'EUR'];

// Только важные события — High и Medium
const ALLOWED_IMPACT = ['High', 'Medium'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  // Если есть кеш в Redis — отдаём
  if (req.method === 'GET' && req.query.fresh !== '1') {
    try {
      const r = await fetch(`${kvUrl}/get/calendar_events`, {
        headers: { Authorization: `Bearer ${kvToken}` }
      });
      const d = await r.json();
      if (d.result) {
        const cached = JSON.parse(d.result);
        const age = Date.now() - cached.ts;
        // Кеш на 1 час
        if (age < 3600000) {
          return res.status(200).json({
            ...cached,
            cached: true,
            age_minutes: Math.round(age / 60000)
          });
        }
      }
    } catch (e) {
      console.error('Cache read error:', e.message);
    }
  }

  // Загружаем свежие данные из JBlanked
  try {
    const r = await fetch(JB_URL, {
      headers: {
        'Authorization': `Api-Key ${JB_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(500).json({ error: 'JBlanked API error', status: r.status, body: errText });
    }

    const raw = await r.json();

    // Debug mode — возвращаем сырые данные
    if (req.query.debug === '1') {
      return res.status(200).json({ rawSample: Array.isArray(raw) ? raw.slice(0, 5) : raw, total: Array.isArray(raw) ? raw.length : 'not array' });
    }


    // Фильтруем и нормализуем
    const events = (Array.isArray(raw) ? raw : []).map(ev => {
      const currency = ev.Currency || ev.currency || '';
      const name = ev.Name || ev.name || '';
      const dateStr = ev.Date || ev.date || '';
      const actual = ev.Actual ?? ev.actual ?? null;
      const forecast = ev.Forecast ?? ev.forecast ?? null;
      const previous = ev.Previous ?? ev.previous ?? null;
      const strength = ev.Strength || ev.strength || ev.Impact || ev.impact || '';

      // Определяем важность
      let impact = 'Low';
      if (typeof strength === 'string') {
        if (strength.toLowerCase().includes('high')) impact = 'High';
        else if (strength.toLowerCase().includes('medium') || strength.toLowerCase().includes('moderate')) impact = 'Medium';
      } else if (typeof strength === 'number') {
        if (strength >= 3) impact = 'High';
        else if (strength >= 2) impact = 'Medium';
      }

      return {
        currency,
        flag: FLAGS[currency] || '🌐',
        name,
        date: dateStr,
        actual,
        forecast,
        previous,
        impact
      };
    }).filter(ev => {
      // Только USD и EUR, только High и Medium
      return ALLOWED_CURRENCIES.includes(ev.currency)
          && ALLOWED_IMPACT.includes(ev.impact)
          && ev.name && ev.date;
    });

    const payload = {
      events,
      ts: Date.now(),
      count: events.length,
      cached: false
    };

    // Сохраняем в кеш
    try {
      await fetch(`${kvUrl}/set/calendar_events/${encodeURIComponent(JSON.stringify(payload))}`, {
        headers: { Authorization: `Bearer ${kvToken}` }
      });
    } catch (e) {
      console.error('Cache write error:', e.message);
    }

    return res.status(200).json(payload);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
