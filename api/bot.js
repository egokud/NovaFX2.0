// NovaFX Telegram Bot — Vercel Edge Function
export const config = { runtime: 'edge' };

const BOT_TOKEN = '8940381514:AAGkmH4zhV9wT2vKuNumqVEUr2juZgHJq2w';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chat_id, text, reply_markup) {
  await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, reply_markup, parse_mode: 'HTML' })
  });
}

async function updateDashboard() {
  // Fetch current data.json SHA
  const r = await fetch('https://api.github.com/repos/egokud/NovaFX2.0/contents/data.json', {
    headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
  });
  const d = await r.json();

  // Get live EUR/USD price from Frankfurter
  const pr = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD');
  const pd = await pr.json();
  const rate = pd.rates.USD.toFixed(5);

  const now = new Date();
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const now_ru = `${now.getUTCDate()} ${months[now.getUTCMonth()]} ${now.getUTCFullYear()}, ${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')} GMT`;
  const now_iso = now.toISOString().replace('.000','');

  // Read current data
  const current = JSON.parse(atob(d.content.replace(/\n/g,'')));

  // Update price and timestamp
  current.updated = now_iso;
  current.updated_ru = now_ru;
  current.price.rate = rate;
  current.price.source = 'ECB/Frankfurter';

  const json = JSON.stringify(current, null, 2);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(json);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  const b64 = btoa(binary);

  const r2 = await fetch('https://api.github.com/repos/egokud/NovaFX2.0/contents/data.json', {
    method: 'PUT',
    headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Auto-update via Telegram bot ${now_iso}`, content: b64, sha: d.sha })
  });
  const d2 = await r2.json();
  return d2.commit ? `✅ Обновлено! Цена EUR/USD: ${rate}\n🕐 ${now_ru}` : '❌ Ошибка обновления';
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('OK', { status: 200 });
  }

  const body = await req.json();
  const msg = body.message || body.callback_query?.message;
  const chat_id = msg?.chat?.id;
  const text = body.message?.text || '';
  const callback_data = body.callback_query?.data;

  // Handle /start
  if (text === '/start') {
    await sendMessage(chat_id,
      `👋 <b>NovaFX Dashboard Bot</b>\n\nЯ обновляю данные EUR/USD на твоём дашборде.\n\n📊 <a href="https://nova-fx-2-0.vercel.app/dashboard">Открыть дашборд</a>`,
      {
        inline_keyboard: [[
          { text: '🔄 Обновить сейчас', callback_data: 'update' },
          { text: '📊 Дашборд', url: 'https://nova-fx-2-0.vercel.app/dashboard' }
        ]]
      }
    );
  }

  // Handle button press
  if (callback_data === 'update') {
    const cid = body.callback_query.message.chat.id;
    // Answer callback to remove loading
    await fetch(`${TG_API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: body.callback_query.id, text: 'Обновляем...' })
    });
    const result = await updateDashboard();
    await sendMessage(cid, result, {
      inline_keyboard: [[
        { text: '🔄 Обновить ещё', callback_data: 'update' },
        { text: '📊 Дашборд', url: 'https://nova-fx-2-0.vercel.app/dashboard' }
      ]]
    });
  }

  return new Response('OK', { status: 200 });
}
