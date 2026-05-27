import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ACTION_TABLE_CONFIG, type ActionTableConfig, GenericActionRepository } from './action-repository';
import type { ActionType } from '@domain/types/action.types';

@Injectable()
export class ActionRepositoryFactory {
  private readonly cache = new Map<string, GenericActionRepository>();

  constructor(private readonly dataSource: DataSource) {}

  for(cfg: ActionTableConfig): GenericActionRepository {
    let repo = this.cache.get(cfg.table);
    if (!repo) {
      repo = new GenericActionRepository(this.dataSource, cfg);
      this.cache.set(cfg.table, repo);
    }
    return repo;
  }

  forType(type: ActionType): GenericActionRepository {
    return this.for(ACTION_TABLE_CONFIG[type]);
  }
}
