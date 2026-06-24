export const config = { api: { bodyParser: false } };

const FF_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

const FLAGS = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  CHF: '🇨🇭', CAD: '🇨🇦', AUD: '🇦🇺', NZD: '🇳🇿', CNY: '🇨🇳'
};

// Только эти валюты (фокус на EUR/USD)
const ALLOWED_CURRENCIES = ['USD', 'EUR'];

// Перевод названий важности
const IMPACT_MAP = {
  'High': 'High',
  'Medium': 'Medium',
  'Low': 'Low',
  'Holiday': 'Holiday'
};

// Только важные
const ALLOWED_IMPACT = ['High', 'Medium'];

// Кеш в Redis на 1 час
const CACHE_TTL_MS = 3600000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  // Читаем кеш
  if (req.method === 'GET' && req.query.fresh !== '1') {
    try {
      const r = await fetch(`${kvUrl}/get/calendar_events`, {
        headers: { Authorization: `Bearer ${kvToken}` }
      });
      const d = await r.json();
      if (d.result) {
        const cached = JSON.parse(d.result);
        const age = Date.now() - cached.ts;
        if (age < CACHE_TTL_MS) {
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

  // Загружаем свежие из Forex Factory
  try {
    const r = await fetch(FF_URL, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 NovaFX Calendar Bot'
      }
    });

    if (!r.ok) {
      return res.status(500).json({ error: 'FF error', status: r.status });
    }

    const raw = await r.json();

    // Debug
    if (req.query.debug === '1') {
      return res.status(200).json({ sample: raw.slice(0, 5), total: raw.length });
    }

    // Фильтруем и нормализуем
    const events = (Array.isArray(raw) ? raw : [])
      .map(ev => ({
        currency: ev.country || '',
        flag: FLAGS[ev.country] || '🌐',
        name: ev.title || '',
        date: ev.date || '',
        actual: ev.actual ?? null,
        forecast: ev.forecast ?? null,
        previous: ev.previous ?? null,
        impact: IMPACT_MAP[ev.impact] || 'Low'
      }))
      .filter(ev => ALLOWED_CURRENCIES.includes(ev.currency)
                  && ALLOWED_IMPACT.includes(ev.impact)
                  && ev.name && ev.date);

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
