import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

const connectionWith = (ping: () => Promise<unknown>) =>
  ({ db: { admin: () => ({ ping }) } }) as unknown as ConstructorParameters<typeof HealthController>[0];

describe('HealthController', () => {
  it('reports ok and db up when the database answers a ping', async () => {
    const ctl = new HealthController(connectionWith(async () => ({ ok: 1 })));
    await expect(ctl.health()).resolves.toEqual({ ok: true, db: 'up' });
  });

  it('answers 503 with ok:false when the ping fails', async () => {
    const ctl = new HealthController(connectionWith(async () => Promise.reject(new Error('ECONNREFUSED'))));
    const err = await ctl.health().catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(err.getStatus()).toBe(503);
    expect(err.getResponse()).toMatchObject({ ok: false, db: 'down', message: 'database unavailable' });
  });

  it('answers 503 when there is no database handle yet (not connected)', async () => {
    const ctl = new HealthController({ db: undefined } as unknown as ConstructorParameters<typeof HealthController>[0]);
    await expect(ctl.health()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not hang forever on a ping that never returns', async () => {
    jest.useFakeTimers();
    try {
      const ctl = new HealthController(connectionWith(() => new Promise(() => undefined)));
      const pending = ctl.health().catch((e) => e);
      await jest.advanceTimersByTimeAsync(2100);
      expect(await pending).toBeInstanceOf(ServiceUnavailableException);
    } finally {
      jest.useRealTimers();
    }
  });
});
