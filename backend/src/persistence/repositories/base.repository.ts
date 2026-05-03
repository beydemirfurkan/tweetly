import type {
  EntityManager,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
  EntityTarget,
  DataSource,
} from 'typeorm';

export interface OwnedEntity {
  userId: string;
}

/**
 * Thin wrapper over TypeORM Repository<T> with opt-in tenant scoping.
 *
 * Why opt-in (not default): some queries are intentionally tenant-agnostic
 * (timeline, search, /trending). Forcing every call to filter by userId
 * either silently breaks those routes or pushes ugly `whereOwnedBy(SYSTEM_ID)`
 * sentinels into the codebase. Caller asks for ownership explicitly:
 *
 *   const qb = repo.qb();                              // unscoped
 *   const mine = repo.scopedToOwner(qb, userId);       // adds WHERE x.user_id = :userId
 *
 * Put repository subclasses under `src/persistence/repositories/` so the
 * data-access shape lives in one folder; controllers should not reach
 * past their facade into a repository directly.
 */
export abstract class BaseRepository<T extends ObjectLiteral & Partial<OwnedEntity>> {
  constructor(
    protected readonly dataSource: DataSource,
    protected readonly target: EntityTarget<T>,
  ) {}

  protected get repo(): Repository<T> {
    return this.dataSource.getRepository(this.target);
  }

  protected manager(): EntityManager {
    return this.dataSource.manager;
  }

  /** Unscoped query builder; alias defaults to the entity name. */
  qb(alias = 'e'): SelectQueryBuilder<T> {
    return this.repo.createQueryBuilder(alias);
  }

  /**
   * Adds `<alias>.user_id = :userId` to the query. The entity must declare
   * a `userId` column for this to compile — TypeScript narrowing makes the
   * misuse loud at the call site.
   */
  scopedToOwner(
    qb: SelectQueryBuilder<T>,
    userId: string,
    alias?: string,
  ): SelectQueryBuilder<T> {
    const a = alias ?? qb.alias;
    return qb.andWhere(`${a}.user_id = :userId`, { userId });
  }
}
