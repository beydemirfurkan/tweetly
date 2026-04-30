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

  it('retries generated tweets that match artificial language patterns', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: string) => fallback),
    } as unknown as ConfigService;
    const settings = {
      get: jest.fn().mockResolvedValue('db-openrouter-key'),
    } as unknown as SettingsService;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'bu repo ilginç bir yöntem sunuyor, ne gibi yenilikler denenebilir merak ediyorum.' } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'agent workflow kurarken asıl sorun hız değil, nerede duracağını bilmesi. bu repo o sınırı tarif etmeye çalışıyor.' } }] }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new OpenRouterService(config, settings);
    const result = await service.generateTweet({
      owner: 'acme',
      name: 'agent-rules',
      slug: 'acme/agent-rules',
      url: 'https://github.com/acme/agent-rules',
      description: 'agent workflow rules',
      language: 'typescript',
      starsToday: 100,
      totalStars: 500,
    });

    expect(result).toBe('agent workflow kurarken asıl sorun hız değil, nerede duracağını bilmesi. bu repo o sınırı tarif etmeye çalışıyor.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
