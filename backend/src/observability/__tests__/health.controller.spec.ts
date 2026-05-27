import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const dataSource = {
    query: jest.fn(),
    showMigrations: jest.fn(),
  };

  beforeEach(async () => {
    dataSource.query.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    dataSource.showMigrations.mockReset().mockResolvedValue(false);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DataSource, useValue: dataSource }],
    }).compile();

    controller = module.get(HealthController);
  });

  it('returns ok status', () => {
    const res = controller.health();
    expect(res.status).toBe('ok');
    expect(res.build).toBe('nest');
    expect(typeof res.ts).toBe('string');
  });

  it('returns readiness checks when dependencies are healthy', async () => {
    const res = await controller.ready();

    expect(res.status).toBe('ok');
    expect(res.checks.database.status).toBe('ok');
    expect(res.checks.migrations).toEqual({ status: 'ok', pending: false });
  });

  it('fails readiness when migrations are pending', async () => {
    dataSource.showMigrations.mockResolvedValue(true);

    await expect(controller.ready()).rejects.toMatchObject({
      response: expect.objectContaining({
        status: 'error',
        checks: expect.objectContaining({
          migrations: { status: 'error', pending: true },
        }),
      }),
    });
  });
});
