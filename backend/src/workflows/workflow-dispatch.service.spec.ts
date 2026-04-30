import { WorkflowDispatchService } from './workflow-dispatch.service';

function mockWorkflow(scenarioType: string) {
  return { scenarioType, run: jest.fn().mockResolvedValue(undefined) };
}

function createService() {
  const accounts = { listActive: jest.fn() };
  const settings = { get: jest.fn() };
  const githubTrending = mockWorkflow('github_trending');
  const wallpaper = mockWorkflow('wallpaper');
  const service = new WorkflowDispatchService(
    accounts as any,
    settings as any,
    githubTrending as any,
    wallpaper as any,
  );
  return { service, accounts, settings, githubTrending, wallpaper };
}

describe('WorkflowDispatchService', () => {
  describe('runForAccount()', () => {
    it('runs github_trending workflow when scenario.type is github_trending', async () => {
      const { service, settings, githubTrending } = createService();
      settings.get.mockResolvedValue('github_trending');
      await service.runForAccount('acc-1');
      expect(githubTrending.run).toHaveBeenCalledWith('acc-1');
    });

    it('runs wallpaper workflow when scenario.type is wallpaper', async () => {
      const { service, settings, wallpaper } = createService();
      settings.get.mockResolvedValue('wallpaper');
      await service.runForAccount('acc-1');
      expect(wallpaper.run).toHaveBeenCalledWith('acc-1');
    });

    it('throws for unknown scenario type', async () => {
      const { service, settings } = createService();
      settings.get.mockResolvedValue('unknown_type');
      await expect(service.runForAccount('acc-1')).rejects.toThrow('Unknown scenario type: unknown_type');
    });

    it('passes accountId to settings.get', async () => {
      const { service, settings, githubTrending } = createService();
      settings.get.mockResolvedValue('github_trending');
      await service.runForAccount('acc-42');
      expect(settings.get).toHaveBeenCalledWith('scenario.type', 'github_trending', 'acc-42');
      expect(githubTrending.run).toHaveBeenCalledWith('acc-42');
    });
  });

  describe('runAll()', () => {
    it('does nothing when no active accounts', async () => {
      const { service, accounts, settings } = createService();
      accounts.listActive.mockResolvedValue([]);
      await service.runAll();
      expect(settings.get).not.toHaveBeenCalled();
    });

    it('runs workflow for each active account', async () => {
      const { service, accounts, settings, githubTrending } = createService();
      accounts.listActive.mockResolvedValue([{ id: 'acc-1' }, { id: 'acc-2' }]);
      settings.get.mockResolvedValue('github_trending');
      await service.runAll();
      expect(githubTrending.run).toHaveBeenCalledTimes(2);
      expect(githubTrending.run).toHaveBeenCalledWith('acc-1');
      expect(githubTrending.run).toHaveBeenCalledWith('acc-2');
    });

    it('continues running for remaining accounts when one fails', async () => {
      const { service, accounts, settings, githubTrending } = createService();
      accounts.listActive.mockResolvedValue([{ id: 'acc-1' }, { id: 'acc-2' }]);
      settings.get.mockResolvedValue('github_trending');
      githubTrending.run
        .mockRejectedValueOnce(new Error('workflow error'))
        .mockResolvedValueOnce(undefined);
      await expect(service.runAll()).resolves.not.toThrow();
      expect(githubTrending.run).toHaveBeenCalledTimes(2);
    });
  });
});
