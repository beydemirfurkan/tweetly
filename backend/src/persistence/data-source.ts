import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '@/config/database.config';

// Resolve repo root from this file's location regardless of cwd. Built file
// lives at dist/persistence/data-source.js, so root is three levels up.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const AppDataSource = new DataSource(buildDataSourceOptions());
