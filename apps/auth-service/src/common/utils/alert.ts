import { Logger } from '@nestjs/common';

const logger = new Logger('Alert');

/**
 * Alert hook. Sends to every channel that is configured; never throws and is bounded by a short timeout so
 * callers can always continue:
 * - ALERT_WEBHOOK_URL: Slack/Discord/Telegram-compatible JSON `{ text }`.
 * - TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID: a Telegram bot (the chat id is read from getUpdates after the
 *   recipient presses Start in the bot).
 */
export async function sendAlert(message: string): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_CHAT_ID;
  const post = async (channel: string, target: string, body: Record<string, unknown>) => {
    try {
      const res = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) logger.error(`Alert delivery failed (${channel}): HTTP ${res.status}`);
    } catch (err) {
      logger.error(`Alert delivery failed (${channel}): ${err instanceof Error ? err.message : err}`);
    }
  };
  const jobs: Promise<void>[] = [];
  if (url) jobs.push(post('webhook', url, { text: message }));
  if (tgToken && tgChat) jobs.push(post('telegram', `https://api.telegram.org/bot${tgToken}/sendMessage`, { chat_id: tgChat, text: message }));
  await Promise.all(jobs);
}
