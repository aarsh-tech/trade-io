import { Logger } from '@nestjs/common';

const logger = new Logger('Alert');

/**
 * Alert hook. Posts to ALERT_WEBHOOK_URL (Slack/Discord/Telegram-compatible JSON `{ text }`) and to a Telegram bot
 * (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID) when configured; never throws and is bounded by a short timeout so
 * callers can always continue.
 */
export async function sendAlert(message: string): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_CHAT_ID;
  const post = async (target: string, body: Record<string, unknown>) => {
    try {
      await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(2000),
      });
    } catch (err) {
      logger.error(`Alert delivery failed: ${err instanceof Error ? err.message : err}`);
    }
  };
  if (url) await post(url, { text: message });
  if (tgToken && tgChat) await post(`https://api.telegram.org/bot${tgToken}/sendMessage`, { chat_id: tgChat, text: message });
}
