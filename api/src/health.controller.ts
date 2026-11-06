import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

const PING_TIMEOUT_MS = 2000;

/** Readiness: 200 only when the database answers a ping. The dev runner and e2e wait on this. */
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Pick<Connection, 'db'>) {}

  @Get()
  async health() {
    if (await this.databaseResponds()) return { ok: true, db: 'up' };
    throw new ServiceUnavailableException({ statusCode: 503, error: 'Service Unavailable', message: 'database unavailable', ok: false, db: 'down' });
  }

  private async databaseResponds(): Promise<boolean> {
    const db = this.connection.db;
    if (!db) return false;
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('ping timed out')), PING_TIMEOUT_MS);
      });
      await Promise.race([db.admin().ping(), timeout]);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
