import { createServer, Server } from 'node:net';
import { assertPortFree, PortInUseError } from './startup';

function occupy(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => resolve({ server, port: (server.address() as { port: number }).port }));
  });
}

describe('assertPortFree', () => {
  it('rejects with PortInUseError and an actionable message when the port is taken', async () => {
    const { server, port } = await occupy();
    try {
      const err = await assertPortFree(port).catch((e) => e);
      expect(err).toBeInstanceOf(PortInUseError);
      expect(err.message).toContain(`Port ${port} is already in use`);
      expect(err.message).toContain(`PORT=${port + 1}`);
      expect(err.message).not.toMatch(/\n\s+at /);
    } finally {
      server.close();
    }
  });

  it('resolves for a free port, and leaves it free afterwards', async () => {
    const { server, port } = await occupy();
    await new Promise((r) => server.close(r));
    await expect(assertPortFree(port)).resolves.toBeUndefined();
    await expect(assertPortFree(port)).resolves.toBeUndefined(); // it released the port
  });
});
