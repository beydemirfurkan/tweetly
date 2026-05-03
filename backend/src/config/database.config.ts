import type { DataSourceOptions, EntitySchema, MixedList } from 'typeorm';
import {
  AccountEntity,
  AccountProfileEntity,
  AccountLoginJobEntity,
  ExtractionJobEntity,
  UserEntity,
  ApiKeyEntity,
  MagicLinkEntity,
  OAuthClientEntity,
  SettingEntity,
  ContentMemoryEntity,
  AnalyticsEventEntity,
  ControlStateEntity,
  PostActionEntity,
  ReplyActionEntity,
  RetweetActionEntity,
  LikeActionEntity,
  FollowActionEntity,
  QuoteActionEntity,
  BookmarkActionEntity,
  MonitorEntity,
  WebhookDeliveryEntity,
} from '@persistence/entities';

export interface DatabaseEnv {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  schema: string;
}

export function readDatabaseEnv(env: NodeJS.ProcessEnv = process.env): DatabaseEnv {
  const url = env.DATABASE_URL || env.DB_URL;
  if (url) return parseDatabaseUrl(url, env);

  return {
    host: env.DB_HOST ?? 'localhost',
    port: parseInt(env.DB_PORT ?? '5432', 10),
    username: env.DB_USER ?? 'tweetly',
    password: env.DB_PASS ?? 'tweetly',
    database: env.DB_NAME ?? 'tweetly',
    ssl: (env.DB_SSL ?? 'false').toLowerCase() === 'true',
    schema: env.DB_SCHEMA ?? 'public',
  };
}

function parseDatabaseUrl(rawUrl: string, env: NodeJS.ProcessEnv): DatabaseEnv {
  try {
    const url = new URL(rawUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, '') || 'postgres'),
      ssl: (env.DB_SSL ?? url.searchParams.get('sslmode') ?? 'false').toLowerCase() === 'true'
        || url.searchParams.get('sslmode') === 'require',
      schema: env.DB_SCHEMA ?? 'public',
    };
  } catch {
    throw new Error('DATABASE_URL is not a valid Postgres URL');
  }
}

const ENTITY_LIST: MixedList<Function | string | EntitySchema<unknown>> = [
  AccountEntity,
  AccountProfileEntity,
  AccountLoginJobEntity,
  ExtractionJobEntity,
  UserEntity,
  ApiKeyEntity,
  MagicLinkEntity,
  OAuthClientEntity,
  SettingEntity,
  ContentMemoryEntity,
  AnalyticsEventEntity,
  ControlStateEntity,
  PostActionEntity,
  ReplyActionEntity,
  RetweetActionEntity,
  LikeActionEntity,
  FollowActionEntity,
  QuoteActionEntity,
  BookmarkActionEntity,
  MonitorEntity,
  WebhookDeliveryEntity,
];

export function buildDataSourceOptions(env: DatabaseEnv = readDatabaseEnv()): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.host,
    port: env.port,
    username: env.username,
    password: env.password,
    database: env.database,
    schema: env.schema,
    ssl: env.ssl ? { rejectUnauthorized: false } : false,
    entities: ENTITY_LIST,
    migrations: [`${__dirname}/../persistence/migrations/*.{ts,js}`],
    migrationsRun: false,
    synchronize: false,
    logging: process.env.DB_LOGGING === 'true',
  };
}
