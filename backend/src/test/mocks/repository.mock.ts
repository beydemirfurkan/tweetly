import type { ObjectLiteral, Repository } from 'typeorm';

export function mockRepository<T extends ObjectLiteral = ObjectLiteral>(): jest.Mocked<Repository<T>> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    create: jest.fn((entity) => entity),
    count: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>;
}
