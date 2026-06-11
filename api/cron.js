// Hourly cron — sends update reminder to Telegram
export const config = { runtime: 'edge' };

const BOT_TOKEN = '8940381514:AAGkmH4zhV9wT2vKuNumqVEUr2juZgHJq2w';
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;

export default async function handler(req) {
  // Vercel cron auth
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date();
  const hour = now.getUTCHours();

  // Only send during trading hours (6:00 - 22:00 GMT)
  if (hour < 6 || hour > 22) {
    return new Response('Outside trading hours', { status: 200 });
  }

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: OWNER_CHAT_ID,
      text: `⏰ <b>Время обновить дашборд EUR/USD</b>\n🕐 ${String(hour).padStart(2,'0')}:00 GMT`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔄 Обновить', callback_data: 'update' },
          { text: '📊 Дашборд', url: 'https://novafx20-alpha.vercel.app/dashboard' }
        ]]
      }
    })
  });

  return new Response('Sent', { status: 200 });
}
