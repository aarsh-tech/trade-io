import { Logger } from '@nestjs/common';

const logger = new Logger('Alert');

/** Per attempt. From the Sydney server Telegram sometimes took over 2 s at 09:20 (3 alerts lost, 3-11 Nov 2026). */
const ALERT_TIMEOUT_MS = 5000;
const ALERT_RETRY_DELAY_MS = 1000;

/**
 * Alert hook. Sends to every channel that is configured; never throws and is bounded by a timeout (one retry on a
 * timeout, network error, 429 or 5xx) so callers can always continue:
 * - ALERT_WEBHOOK_URL: Slack/Discord/Telegram-compatible JSON `{ text }`.
 * - TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID: a Telegram bot (the chat id is read from getUpdates after the
 *   recipient presses Start in the bot).
 */
export async function sendAlert(message: string): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_CHAT_ID;
  const post = async (channel: string, target: string, body: Record<string, unknown>) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let failure: string;
      try {
        const res = await fetch(target, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
        });
        if (res.ok) return;
        failure = `HTTP ${res.status}`;
        if (res.status !== 429 && res.status < 500) attempt = 2; // a 4xx other than 429 will not get better
      } catch (err) {
        failure = err instanceof Error ? err.message : String(err);
      }
      if (attempt === 2) {
        logger.error(`Alert delivery failed (${channel}): ${failure}`);
        return;
      }
      await new Promise((r) => setTimeout(r, ALERT_RETRY_DELAY_MS));
    }
  };
  const jobs: Promise<void>[] = [];
  if (url) jobs.push(post('webhook', url, { text: message }));
  if (tgToken && tgChat) jobs.push(post('telegram', `https://api.telegram.org/bot${tgToken}/sendMessage`, { chat_id: tgChat, text: message }));
  await Promise.all(jobs);
}
