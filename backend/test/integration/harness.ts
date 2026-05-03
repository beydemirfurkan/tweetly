import { DataSource } from 'typeorm';
import { Client } from 'pg';
import { buildDataSourceOptions, readDatabaseEnv } from '../../src/config/database.config';

/**
 * Integration-test database harness.
 *
 * Connects to the local Postgres on `INTEGRATION_DB_HOST` (default
 * localhost:5432) using the maintenance database `postgres`, then creates a
 * dedicated database (default `tweetly_integration_test`) per process,
 * applies all migrations against it, and exposes a typed DataSource.
 *
 * `truncateAll()` keeps tests isolated without paying the migration cost
 * between specs. `stop()` drops the database and closes the connection so
 * leftover state never carries over.
 *
 * Future: swap to `@testcontainers/postgresql` when Docker is available
 * (the dependency is already in package.json) — only `start()` changes.
 */
export class IntegrationDbHarness {
  private originalEnv: Record<string, string | undefined> = {};
  dataSource!: DataSource;

  private readonly host = process.env.INTEGRATION_DB_HOST ?? 'localhost';
  private readonly port = parseInt(process.env.INTEGRATION_DB_PORT ?? '5432', 10);
  private readonly user = process.env.INTEGRATION_DB_USER ?? process.env.USER ?? 'postgres';
  private readonly password = process.env.INTEGRATION_DB_PASS ?? '';
  private readonly maintenanceDb = process.env.INTEGRATION_DB_MAINTENANCE ?? 'postgres';
  private readonly dbName =
    process.env.INTEGRATION_DB_NAME ?? `tweetly_integration_test_${process.pid}`;

  async start(): Promise<void> {
    // Save the env so we can restore it for any other code paths in the
    // process that read DB_* (we override them so the app's DataSource
    // points at our throwaway DB).
    this.originalEnv = {
      DB_HOST: process.env.DB_HOST,
      DB_PORT: process.env.DB_PORT,
      DB_USER: process.env.DB_USER,
      DB_PASS: process.env.DB_PASS,
      DB_NAME: process.env.DB_NAME,
    };

    await this.createDatabase();

    process.env.DB_HOST = this.host;
    process.env.DB_PORT = String(this.port);
    process.env.DB_USER = this.user;
    process.env.DB_PASS = this.password;
    process.env.DB_NAME = this.dbName;

    this.dataSource = new DataSource(buildDataSourceOptions(readDatabaseEnv()));
    await this.dataSource.initialize();
    await this.dataSource.runMigrations();
  }

  async truncateAll(): Promise<void> {
    // Restart sequences so UUIDs/serials don't drift across tests; CASCADE
    // handles FK chains (monitors → webhook_deliveries, etc.).
    const tables = (await this.dataSource.query(
      `SELECT tablename FROM pg_tables
        WHERE schemaname='public'
          AND tablename NOT IN ('migrations')`,
    )) as Array<{ tablename: string }>;
    if (tables.length === 0) return;
    const list = tables.map((t) => `"${t.tablename}"`).join(', ');
    await this.dataSource.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }

  async stop(): Promise<void> {
    if (this.dataSource?.isInitialized) await this.dataSource.destroy();
    await this.dropDatabase();
    for (const [k, v] of Object.entries(this.originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  private async createDatabase(): Promise<void> {
    const client = new Client({
      host: this.host,
      port: this.port,
      user: this.user,
      password: this.password,
      database: this.maintenanceDb,
    });
    await client.connect();
    try {
      // Drop a leftover from a previous crashed run before recreating.
      await client.query(`DROP DATABASE IF EXISTS "${this.dbName}"`);
      await client.query(`CREATE DATABASE "${this.dbName}"`);
    } finally {
      await client.end();
    }
  }

  private async dropDatabase(): Promise<void> {
    const client = new Client({
      host: this.host,
      port: this.port,
      user: this.user,
      password: this.password,
      database: this.maintenanceDb,
    });
    await client.connect();
    try {
      // FORCE makes Postgres terminate any lingering connections so the
      // drop doesn't fail mid-test-suite.
      await client.query(`DROP DATABASE IF EXISTS "${this.dbName}" WITH (FORCE)`);
    } finally {
      await client.end();
    }
  }
}
