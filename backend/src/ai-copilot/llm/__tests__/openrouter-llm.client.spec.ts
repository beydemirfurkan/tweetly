import { OpenRouterLlmClient } from '../openrouter-llm.client';
import type { SettingsService } from '@/settings/settings.service';

function mockFetchOnce(response: Partial<Response> | Error): jest.SpyInstance {
  const spy = jest.spyOn(global, 'fetch');
  if (response instanceof Error) {
    spy.mockRejectedValueOnce(response);
  } else {
    spy.mockResolvedValueOnce(response as Response);
  }
  return spy;
}

function makeResponse(opts: { status: number; jsonBody?: unknown; textBody?: string }): Partial<Response> {
  return {
    status: opts.status,
    statusText: opts.status === 200 ? 'OK' : 'Error',
    ok: opts.status >= 200 && opts.status < 300,
    json: jest.fn().mockResolvedValueOnce(opts.jsonBody),
    text: jest.fn().mockResolvedValueOnce(opts.textBody ?? ''),
  };
}

function makeService(apiKey = 'sk-or-test'): { svc: OpenRouterLlmClient; settings: jest.Mocked<SettingsService> } {
  const settings = {
    get: jest.fn().mockResolvedValue(apiKey),
  } as unknown as jest.Mocked<SettingsService>;
  const svc = new OpenRouterLlmClient(settings);
  return { svc, settings };
}

describe('OpenRouterLlmClient.chat', () => {
  afterEach(() => jest.restoreAllMocks());

  it('throws when no API key is configured (settings returns empty string)', async () => {
    const { svc } = makeService('');
    await expect(svc.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/API key not configured/);
  });

  it('returns content + parsed usage on a 200 response', async () => {
    mockFetchOnce(
      makeResponse({
        status: 200,
        jsonBody: {
          choices: [{ message: { content: 'hello world' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      }),
    );

    const { svc } = makeService();
    const result = await svc.chat([{ role: 'user', content: 'hi' }]);

    expect(result.content).toBe('hello world');
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
  });

  it('returns content with undefined usage when the response omits the usage block', async () => {
    mockFetchOnce(
      makeResponse({
        status: 200,
        jsonBody: { choices: [{ message: { content: 'just text' } }] },
      }),
    );

    const { svc } = makeService();
    const result = await svc.chat([{ role: 'user', content: 'hi' }]);

    expect(result.content).toBe('just text');
    expect(result.usage).toBeUndefined();
  });

  it('returns empty string when the response has no choices (malformed)', async () => {
    mockFetchOnce(makeResponse({ status: 200, jsonBody: { choices: [] } }));

    const { svc } = makeService();
    const result = await svc.chat([{ role: 'user', content: 'hi' }]);
    expect(result.content).toBe('');
  });

  it('throws with status + body when the API returns non-2xx', async () => {
    mockFetchOnce(makeResponse({ status: 429, textBody: 'rate limited' }));

    const { svc } = makeService();
    await expect(svc.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/429.*rate limited/);
  });

  it('forwards model + temperature + maxTokens to the API request body', async () => {
    const spy = mockFetchOnce(
      makeResponse({
        status: 200,
        jsonBody: { choices: [{ message: { content: 'x' } }] },
      }),
    );

    const { svc } = makeService();
    await svc.chat([{ role: 'user', content: 'hi' }], {
      model: 'anthropic/claude-3-opus',
      temperature: 0.1,
      maxTokens: 256,
    });

    const init = spy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe('anthropic/claude-3-opus');
    expect(body.temperature).toBe(0.1);
    expect(body.max_tokens).toBe(256);
  });
});
