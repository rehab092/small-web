import { createServer } from 'node:net';

/** The port the API wants is taken. The message says what to do about it. */
export class PortInUseError extends Error {
  constructor(readonly port: number) {
    super(
      [
        `Port ${port} is already in use.`,
        '  - Stop whatever is using it (often an earlier "npm run dev:api"),',
        `  - or choose another port:   PORT=${port + 1} npm run dev:api   (or set PORT in api/.env).`,
      ].join('\n'),
    );
    this.name = 'PortInUseError';
  }
}

/** Resolves when `port` can be bound, rejects with PortInUseError when something else holds it. */
export function assertPortFree(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (err: NodeJS.ErrnoException) => reject(err.code === 'EADDRINUSE' ? new PortInUseError(port) : err));
    probe.once('listening', () => probe.close(() => resolve()));
    probe.listen(port);
  });
}
