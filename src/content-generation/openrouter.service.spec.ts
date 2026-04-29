import type { ConfigService } from '@nestjs/config';
import { OpenRouterService } from './openrouter.service';
import type { SettingsService } from '../settings/settings.service';

describe('OpenRouterService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('reads OpenRouter API key from database settings first', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: string) => fallback),
    } as unknown as ConfigService;
    const settings = {
      get: jest.fn().mockResolvedValue('db-openrouter-key'),
    } as unknown as SettingsService;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'cevap' } }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new OpenRouterService(config, settings);
    const result = await service.chat([{ role: 'user', content: 'merhaba' }]);

    expect(result).toBe('cevap');
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer db-openrouter-key' }),
    }));
  });
});
