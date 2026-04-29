import { readDatabaseEnv } from './database.config';

describe('readDatabaseEnv', () => {
  it('parses DATABASE_URL when provided', () => {
    const env = readDatabaseEnv({
      DATABASE_URL: 'postgres://user:pass%40word@example.com:4442/postgres',
    } as NodeJS.ProcessEnv);

    expect(env).toEqual({
      host: 'example.com',
      port: 4442,
      username: 'user',
      password: 'pass@word',
      database: 'postgres',
      ssl: false,
      schema: 'public',
    });
  });

  it('keeps DB_* fallback for local compose', () => {
    const env = readDatabaseEnv({
      DB_HOST: 'postgres',
      DB_PORT: '5433',
      DB_USER: 'tweetly',
      DB_PASS: 'secret',
      DB_NAME: 'tweetly',
    } as NodeJS.ProcessEnv);

    expect(env.host).toBe('postgres');
    expect(env.port).toBe(5433);
    expect(env.username).toBe('tweetly');
    expect(env.password).toBe('secret');
    expect(env.database).toBe('tweetly');
  });
});
