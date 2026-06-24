export const config = { api: { bodyParser: false } };

const FLAGS = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  CHF: '🇨🇭', CAD: '🇨🇦', AUD: '🇦🇺', NZD: '🇳🇿', CNY: '🇨🇳'
};

const ALLOWED_CURRENCIES = ['USD', 'EUR'];
const ALLOWED_IMPACT = ['High'];
const CRON_SECRET = process.env.CRON_SECRET || 'novafx2026';

// CP1251 → Unicode map (только верхние байты 0x80-0xFF)
const CP1251_MAP = (function(){
  // Стандартный CP1251 (Windows-1251)
  const chars = '\u0402\u0403\u201a\u0453\u201e\u2026\u2020\u2021\u20ac\u2030\u0409\u2039\u040a\u040c\u040b\u040f' +
                '\u0452\u2018\u2019\u201c\u201d\u2022\u2013\u2014\ufffd\u2122\u0459\u203a\u045a\u045c\u045b\u045f' +
                '\u00a0\u040e\u045e\u0408\u00a4\u0490\u00a6\u00a7\u0401\u00a9\u0404\u00ab\u00ac\u00ad\u00ae\u0407' +
                '\u00b0\u00b1\u0406\u0456\u0491\u00b5\u00b6\u00b7\u0451\u2116\u0454\u00bb\u0458\u0405\u0455\u0457' +
                '\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417\u0418\u0419\u041a\u041b\u041c\u041d\u041e\u041f' +
                '\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042a\u042b\u042c\u042d\u042e\u042f' +
                '\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u0439\u043a\u043b\u043c\u043d\u043e\u043f' +
                '\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044a\u044b\u044c\u044d\u044e\u044f';
  return chars;
})();

function decodeCp1251(buf) {
  var out = '';
  for (var i = 0; i < buf.length; i++) {
    var b = buf[i];
    if (b < 0x80) out += String.fromCharCode(b);
    else out += CP1251_MAP[b - 0x80];
  }
  return out;
}

function readBody(req) {
  return new Promise(function(resolve, reject) {
    var chunks = [];
    req.on('data', function(c){ chunks.push(c); });
    req.on('end', function(){
      try { resolve(Buffer.concat(chunks)); } catch(e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function hasCyrillic(s) {
  return /[\u0400-\u04FF]/.test(String(s || ''));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var kvUrl = process.env.KV_REST_API_URL;
  var kvToken = process.env.KV_REST_API_TOKEN;

  // ===== POST: приём данных, ТОЛЬКО MT5 =====
  if (req.method === 'POST') {
    var auth = req.headers['authorization'] || '';
    if (auth !== 'Bearer ' + CRON_SECRET) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    try {
      var buf = await readBody(req);
      // Try UTF-8 first, fallback to CP1251 if it has many high bytes and fails JSON
      var raw, body;
      try {
        raw = buf.toString('utf8');
        body = JSON.parse(raw);
      } catch (e1) {
        try {
          raw = decodeCp1251(buf);
          body = JSON.parse(raw);
        } catch (e2) {
          return res.status(400).json({ error: 'bad json (utf8+cp1251 both failed): ' + e1.message });
        }
      }

      if (!body.events || !Array.isArray(body.events)) {
        return res.status(400).json({ error: 'events array required' });
      }

      // === MT5 marker check ===
      var explicitMT5 = String(body.source || '').toLowerCase() === 'mt5';
      var hasCyrillicNames = body.events.some(function(e){ return hasCyrillic(e.name); });
      var isMT5 = explicitMT5 || hasCyrillicNames;

      if (!isMT5) {
        // Логируем кто пытался писать (для диагностики)
        var senderInfo = {
          ts: Date.now(),
          ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown',
          ua: (req.headers['user-agent'] || '').slice(0, 200),
          host: req.headers['host'] || '',
          source_field: body.source || null,
          event_count: body.events.length,
          sample_name: (body.events[0] && body.events[0].name) || '',
          sample_date: (body.events[0] && body.events[0].date) || ''
        };
        try {
          await fetch(kvUrl + '/set/calendar_rejected_last/' + encodeURIComponent(JSON.stringify(senderInfo)), {
            headers: { Authorization: 'Bearer ' + kvToken }
          });
        } catch (e) { /* ignore */ }

        return res.status(403).json({
          error: 'only MT5 data accepted',
          hint: 'add "source":"mt5" in payload OR use Cyrillic event names',
          rejected_from: senderInfo.ip,
          rejected_ua: senderInfo.ua,
          rejected_sample: senderInfo.sample_name
        });
      }

      // Нормализация и фильтр
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

      return res.status(200).json({ ok: true, count: events.length, source: 'mt5' });
    } catch (e) {
      return res.status(400).json({ error: 'bad request: ' + e.message });
    }
  }

  // ===== GET =====
  if (req.method === 'GET') {
    // Debug-режим: видеть отвергнутые POST'ы
    if (req.query && req.query.debug === 'rejected') {
      try {
        var r2 = await fetch(kvUrl + '/get/calendar_rejected_last', {
          headers: { Authorization: 'Bearer ' + kvToken }
        });
        var d2 = await r2.json();
        if (d2.result) return res.status(200).json(JSON.parse(d2.result));
        return res.status(200).json({ info: 'no rejected POSTs yet' });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

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
