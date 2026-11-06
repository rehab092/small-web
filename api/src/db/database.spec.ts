import { DEV_DB_URI, assertDatabaseReachable, describeStartupError, redactUri, resolveMongoUri } from './database';

describe('resolveMongoUri', () => {
  it('uses MONGO_URI when set, trimmed', () => {
    expect(resolveMongoUri({ MONGO_URI: '  mongodb://db.example:27017/x  ' })).toBe('mongodb://db.example:27017/x');
  });
  it('falls back to the dev database when unset or blank (the app runs with no .env at all)', () => {
    expect(resolveMongoUri({})).toBe(DEV_DB_URI);
    expect(resolveMongoUri({ MONGO_URI: '   ' })).toBe(DEV_DB_URI);
  });
});

describe('redactUri', () => {
  it.each([
    ['mongodb://127.0.0.1:27017/small-web', '127.0.0.1:27017'],
    ['mongodb://user:s3cr3t@db.example:27017/small-web?authSource=admin', 'db.example:27017'],
    ['mongodb+srv://user:p%40ss@cluster0.abc.mongodb.net/db', 'cluster0.abc.mongodb.net'],
    ['mongodb://u:p@a.example:1,b.example:2/db', 'a.example:1,b.example:2'],
  ])('%s -> %s', (uri, expected) => {
    expect(redactUri(uri)).toBe(expected);
  });

  it('never leaks a password or username', () => {
    const out = redactUri('mongodb://admin:hunter2@db.example:27017/small-web');
    expect(out).not.toMatch(/hunter2|admin/);
  });
});

describe('assertDatabaseReachable', () => {
  it('rejects quickly when nothing listens, with an error describeStartupError turns into the friendly message', async () => {
    const uri = 'mongodb://admin:hunter2@127.0.0.1:1/small-web';
    const started = Date.now();
    const err = await assertDatabaseReachable(uri, 500).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(Date.now() - started).toBeLessThan(5000);
    const message = describeStartupError(err, uri)!;
    expect(message).toContain('Could not reach MongoDB at 127.0.0.1:1');
    expect(message).not.toMatch(/hunter2/);
  });
});

describe('describeStartupError', () => {
  it.each([
    ['connection refused', Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:27018'), { name: 'MongooseServerSelectionError' })],
    ['server selection timeout', new Error('Server selection timed out after 4000 ms')],
    ['unknown host', new Error('getaddrinfo ENOTFOUND db.example')],
    ['nest retry exhausted', new Error('Unable to connect to the database. Retrying (1)...')],
  ])('gives a friendly message for: %s', (_name, err) => {
    const message = describeStartupError(err, 'mongodb://127.0.0.1:27018/small-web')!;
    expect(message).toContain('Could not reach MongoDB at 127.0.0.1:27018');
    expect(message).toContain('npm run dev:db');
    expect(message).toContain('docker compose up -d');
    expect(message).toContain('MONGO_URI');
    expect(message).not.toMatch(/\n\s+at /); // no stack trace
  });

  it('does not print credentials from the URI', () => {
    const message = describeStartupError(new Error('ECONNREFUSED'), 'mongodb://admin:hunter2@db.example:27017/x')!;
    expect(message).toContain('db.example:27017');
    expect(message).not.toMatch(/hunter2|admin/);
  });

  it('returns null for unrelated errors, so real bugs keep their stack trace', () => {
    expect(describeStartupError(new TypeError('x is not a function'))).toBeNull();
    expect(describeStartupError('weird')).toBeNull();
    expect(describeStartupError(undefined)).toBeNull();
  });
});
