import { Logger } from '@nestjs/common';

const logger = new Logger('Alert');

/**
 * Alert hook. Posts to ALERT_WEBHOOK_URL (Slack/Discord/Telegram-compatible JSON `{ text }`)
 * when configured; never throws and is bounded by a short timeout so callers can always continue.
 */
export async function sendAlert(message: string): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
      signal: AbortSignal.timeout(2000),
    });
  } catch (err) {
    logger.error(`Alert delivery failed: ${err instanceof Error ? err.message : err}`);
  }
}
