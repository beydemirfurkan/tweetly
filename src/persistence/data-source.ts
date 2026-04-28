import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../config/database.config';

dotenv.config();

export const AppDataSource = new DataSource(buildDataSourceOptions());
