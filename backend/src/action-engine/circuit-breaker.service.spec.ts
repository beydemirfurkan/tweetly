import { CircuitBreakerService } from './circuit-breaker.service';

function makeService() {
  const dataSource = { query: jest.fn() };
  const service = new CircuitBreakerService(dataSource as any);
  return { service, dataSource };
}

describe('CircuitBreakerService', () => {
  it('clears a manual circuit-breaker pause', async () => {
    const { service, dataSource } = makeService();
    dataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { field: 'paused', value: 'false' },
        { field: 'consecutiveFailures', value: '0' },
      ]);

    const snapshot = await service.clear('test-account');

    expect(snapshot.paused).toBe(false);
    expect(snapshot.consecutiveFailures).toBe(0);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (key, account_id)'),
      ['paused', 'test-account', 'false'],
    );
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (key, account_id)'),
      ['consecutiveFailures', 'test-account', '0'],
    );
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM control_state'),
      ['test-account', 'reason', 'pausedAt', 'pauseUntil'],
    );
  });
});
