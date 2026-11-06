/** Database URI resolution shared by the API and the seed command. */
export const DEV_DB_URI = 'mongodb://127.0.0.1:27018/small-web';

/**
 * MONGO_URI wins. When it is unset we fall back to the development database
 * started by `npm run dev:db -w api` (an in-memory mongod with a persistent dbPath).
 */
export function resolveMongoUri(env: NodeJS.ProcessEnv = process.env): string {
  const uri = env.MONGO_URI?.trim();
  return uri ? uri : DEV_DB_URI;
}
