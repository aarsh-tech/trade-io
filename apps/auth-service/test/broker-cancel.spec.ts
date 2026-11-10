import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BrokersService } from '../src/brokers/brokers.service';
import { TokenException } from '../src/brokers/kite-errors';

describe('broker cancellation', () => {
  const account = { id: 'broker', userId: 'owner', accessToken: 'encrypted', tokenHealth: 'HEALTHY' };
  let prisma: any, factory: any, cancel: jest.Mock, service: BrokersService;
  beforeEach(() => {
    prisma = { brokerAccount: { findUnique: jest.fn().mockResolvedValue(account), update: jest.fn().mockResolvedValue({}) } };
    cancel = jest.fn().mockResolvedValue(undefined);
    factory = { createClient: jest.fn().mockReturnValue({ cancelOrder: cancel }) };
    service = new BrokersService(prisma, factory, {} as any);
  });
  test('rejects another user before touching the broker', async () => {
    await expect(service.cancelOrder('someone-else', 'broker', '123')).rejects.toBeInstanceOf(NotFoundException);
    expect(factory.createClient).not.toHaveBeenCalled();
  });
  test('rejects expired sessions and paper placeholders', async () => {
    prisma.brokerAccount.findUnique.mockResolvedValueOnce({ ...account, tokenHealth: 'EXPIRED' });
    await expect(service.cancelOrder('owner', 'broker', '123')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.cancelOrder('owner', 'broker', 'PAPER_1')).rejects.toBeInstanceOf(BadRequestException);
    expect(cancel).not.toHaveBeenCalled();
  });
  test('allows cancellation without entry risk checks and leaves final fills to postbacks', async () => {
    await service.cancelOrder('owner', 'broker', '123');
    expect(cancel).toHaveBeenCalledWith('123');
    expect(prisma.brokerAccount.update).not.toHaveBeenCalled();
  });
  test('marks expired tokens while propagating broker failures', async () => {
    cancel.mockRejectedValueOnce(new TokenException('Expired', 403));
    await expect(service.cancelOrder('owner', 'broker', '123')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.brokerAccount.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tokenHealth: 'EXPIRED' }) }));
    cancel.mockRejectedValueOnce(new Error('Already filled'));
    await expect(service.cancelOrder('owner', 'broker', '123')).rejects.toThrow('Already filled');
  });
});
