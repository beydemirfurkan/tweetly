import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get(HealthController);
  });

  it('returns ok status', () => {
    const res = controller.health();
    expect(res.status).toBe('ok');
    expect(res.build).toBe('nest');
    expect(typeof res.ts).toBe('string');
  });
});
