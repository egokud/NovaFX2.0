export const config = { runtime: 'edge' };
const BOT_TOKEN = '8940381514:AAGkmH4zhV9wT2vKuNumqVEUr2juZgHJq2w';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const TG_API = 'https://api.telegram.org/bot' + BOT_TOKEN;

async function sendMsg(chat_id, text, markup) {
  await fetch(TG_API + '/sendMessage', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ chat_id, text, reply_markup: markup, parse_mode:'HTML' }) });
}

async function updateDashboard() {
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

  // Decode current data - handle UTF-8 properly
  const raw = atob(d.content.replace(/\n/g,''));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const current = JSON.parse(new TextDecoder('utf-8').decode(bytes));

  // Update only price and timestamp
  current.updated = nowISO;
  current.updated_ru = nowStr;
  current.price.rate = rate;
  current.price.source = 'ECB/Frankfurter';

  // Encode back - ASCII-safe via JSON ensure_ascii equivalent
  const jsonStr = JSON.stringify(current, null, 2);
  // Use proper UTF-8 base64 encoding
  const encoded = new TextEncoder().encode(jsonStr);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < encoded.length; i += chunkSize) {
    const chunk = encoded.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  const b64 = btoa(binary);

  const r2 = await fetch('https://api.github.com/repos/egokud/NovaFX2.0/contents/data.json',
    { method:'PUT', headers:{'Authorization':'token '+GITHUB_TOKEN,'Content-Type':'application/json'},
      body: JSON.stringify({ message: 'Bot update ' + nowISO, content: b64, sha: d.sha }) });
  const d2 = await r2.json();
  return d2.commit ? 'EUR/USD: ' + rate + '\n' + nowStr : 'Error: ' + JSON.stringify(d2).slice(0,80);
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('OK');
  const body = await req.json();
  const text = body.message?.text || '';
  const chat_id = body.message?.chat?.id || body.callback_query?.message?.chat?.id;
  const cb = body.callback_query?.data;
  const markup = { inline_keyboard: [[{ text: 'Update', callback_data:'update'},{ text:'Dashboard', url:'https://novafx20-alpha.vercel.app/dashboard'}]] };
  if (text === '/start') {
    await sendMsg(chat_id,
      '👋 <b>Добро пожаловать в NovaFX!</b>\n\n' +
      'Мы разрабатываем алгоритмические торговые стратегии для EUR/USD на платформе MetaTrader 5.\n\n' +
      '📈 <b>Консервативная стратегия</b> — +69% за последние 12 месяцев\n' +
      '🤖 Советник работает автоматически 24/5 на VPS\n' +
      '📊 Минимальный депозит — от $25 000\n\n' +
      'Узнать подробнее и начать:',
      { inline_keyboard: [[
        { text: '🌐 Сайт', url: 'https://novafx20-alpha.vercel.app' },
        { text: '📊 Дашборд', url: 'https://novafx20-alpha.vercel.app/dashboard' }
      ], [
        { text: '💬 Написать нам', url: 'https://t.me/digitalnovafx' }
      ]] }
    );
  }
  if (cb === 'update') {
    await fetch(TG_API+'/answerCallbackQuery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({callback_query_id:body.callback_query.id,text:'Updating...'})});
    const result = await updateDashboard();
    await sendMsg(chat_id, result, markup);
  }
  return new Response('OK');
}
