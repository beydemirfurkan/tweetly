import { CircuitBreakerService } from './circuit-breaker.service';
import { ControlStateRepository } from '@persistence/repositories/control-state.repository';

function makeService() {
  const query = jest.fn();
  // ControlStateRepository.upsert now wraps batch writes in a transaction;
  // route manager.query back to the same mock so existing assertions on the
  // ON CONFLICT path keep working without rewriting the spec.
  const transaction = jest.fn(async (fn: (m: { query: jest.Mock }) => Promise<unknown>) =>
    fn({ query }),
  );
  const dataSource = { query, transaction };
  const state = new ControlStateRepository(dataSource as any);
  const service = new CircuitBreakerService(state);
  return { service, dataSource };
}

describe('CircuitBreakerService', () => {
  it('clears a manual circuit-breaker pause', async () => {
    const { service, dataSource } = makeService();
    // Two upserts (paused=false, consecutiveFailures=0), one delete for the
    // pause keys, then a load (returns the cleared snapshot rows).
    dataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { key: 'paused', account_id: 'test-account', value: 'false' },
        { key: 'consecutiveFailures', account_id: 'test-account', value: '0' },
      ]);

    const snapshot = await service.clear('test-account');

    expect(snapshot.paused).toBe(false);
    expect(snapshot.consecutiveFailures).toBe(0);
    // Upserts route through the repository's INSERT … ON CONFLICT.
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
