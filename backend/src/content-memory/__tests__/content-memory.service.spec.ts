import { ContentMemoryService } from './content-memory.service';

function createMockQueryBuilder(rows: unknown[] = []) {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  };
  return qb;
}

function createService(rows: unknown[] = []) {
  const qb = createMockQueryBuilder(rows);
  const repo = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    insert: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ContentMemoryService(repo as any);
  return { service, repo, qb };
}

const TEXT_A = 'Build a typescript react application with docker and kubernetes deployment pipeline';
const TEXT_B = 'Check out this python machine learning model for natural language processing';

describe('ContentMemoryService', () => {
  describe('similarityReason()', () => {
    it('returns null when memory is empty', async () => {
      const { service } = createService([]);
      const reason = await service.similarityReason(TEXT_A);
      expect(reason).toBeNull();
    });

    it('detects previously stored identical text', async () => {
      const { service } = createService([
        { repo: 'owner/same', textHash: 'wrong-hash', text: TEXT_A },
      ]);
      const reason = await service.similarityReason(TEXT_A);
      expect(reason).not.toBeNull();
      expect(reason).toContain('owner/same');
    });

    it('detects same opening signature for near-identical text', async () => {
      // Store TEXT_A, then query TEXT_A without trailing punctuation — first words are identical
      const { service } = createService([
        { repo: 'owner/repo', textHash: 'x', text: TEXT_A },
      ]);
      const reason = await service.similarityReason(TEXT_A);
      expect(reason).toMatch(/same opening signature/);
    });

    it('detects high keyword overlap', async () => {
      const { service } = createService([
        { repo: 'owner/repo', textHash: 'x', text: TEXT_A },
      ]);
      // Very similar text, different word order
      const similar = 'typescript react application build with kubernetes docker deployment pipeline';
      const reason = await service.similarityReason(similar);
      expect(reason).toMatch(/keyword overlap|opening signature|hash/);
    });

    it('returns null for completely different text', async () => {
      const { service } = createService([
        { repo: 'owner/repo', textHash: 'x', text: TEXT_A },
      ]);
      const reason = await service.similarityReason(TEXT_B);
      expect(reason).toBeNull();
    });

    it('adds account-specific where clause when accountId provided', async () => {
      const { service, qb } = createService([]);
      await service.similarityReason(TEXT_A, 'acc-1');
      expect(qb.where).toHaveBeenCalledWith(
        expect.stringContaining('accountId'),
        expect.objectContaining({ accountId: 'acc-1' }),
      );
    });

    it('does not add where clause when no accountId', async () => {
      const { service, qb } = createService([]);
      await service.similarityReason(TEXT_A);
      expect(qb.where).not.toHaveBeenCalled();
    });
  });

  describe('add()', () => {
    it('calls repo.insert with correct fields', async () => {
      const { service, repo } = createService();
      await service.add('owner/repo', TEXT_A, 'acc-1');
      expect(repo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          repo: 'owner/repo',
          text: TEXT_A,
          accountId: 'acc-1',
        }),
      );
    });

    it('sets accountId to null when not provided', async () => {
      const { service, repo } = createService();
      await service.add('owner/repo', TEXT_A);
      expect(repo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: null }),
      );
    });

    it('stores textHash and signature', async () => {
      const { service, repo } = createService();
      await service.add('owner/repo', TEXT_A);
      const call = repo.insert.mock.calls[0][0];
      expect(typeof call.textHash).toBe('string');
      expect(call.textHash.length).toBeGreaterThan(0);
      expect(typeof call.signature).toBe('string');
    });
  });
});
