import { Logger } from '@nestjs/common';
import { sendAlert } from '../src/common/utils/alert';

/** Telegram delivery: one retry on a timeout or a server error, none on a bad request. Nothing leaves the machine. */
describe('sendAlert', () => {
  const realFetch = global.fetch;
  const env = { ...process.env };
  let fetchMock: jest.Mock;

  beforeAll(() => Logger.overrideLogger(false));
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = '1';
    delete process.env.ALERT_WEBHOOK_URL;
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });
  afterAll(() => {
    global.fetch = realFetch;
    process.env = env;
  });

  it('sends once when Telegram answers', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await sendAlert('hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ chat_id: '1', text: 'hello' });
  });

  it('retries once after a timeout', async () => {
    fetchMock.mockRejectedValueOnce(new Error('The operation was aborted due to timeout')).mockResolvedValueOnce({ ok: true, status: 200 });
    await sendAlert('hello');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a 429 or 5xx, but not a 400', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 });
    await sendAlert('a');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: false, status: 400 });
    await sendAlert('b');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never throws', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    await expect(sendAlert('x')).resolves.toBeUndefined();
  });
});
