import { ContentSuggesterService } from './content-suggester.service';
import type { OpenRouterService } from './openrouter.service';
import type { StyleProfile } from '../types/style-profile.types';

function makeService(mockChat: jest.Mock): {
  svc: ContentSuggesterService;
  ai: jest.Mocked<OpenRouterService>;
} {
  const ai = { chat: mockChat } as unknown as jest.Mocked<OpenRouterService>;
  const svc = new ContentSuggesterService(ai);
  return { svc, ai };
}

const SAMPLE_SUGGESTIONS = [
  { text: 'short hook here', reasoning: 'curiosity gap', estimatedScore: 8.5 },
  { text: 'second option', reasoning: 'pattern interrupt', estimatedScore: 7 },
  { text: 'third option', reasoning: 'emotional trigger', estimatedScore: 6.5 },
];

describe('ContentSuggesterService.suggest', () => {
  it('parses a clean JSON array and assigns ids / charCount per suggestion', async () => {
    const chat = jest.fn().mockResolvedValue({ content: JSON.stringify(SAMPLE_SUGGESTIONS) });
    const { svc } = makeService(chat);

    const result = await svc.suggest({ format: 'punch' });

    expect(result.format).toBe('punch');
    expect(result.suggestions).toHaveLength(3);
    expect(result.suggestions[0]).toEqual(
      expect.objectContaining({
        text: 'short hook here',
        format: 'punch',
        charCount: 'short hook here'.length,
        estimatedScore: 8.5,
        reasoning: 'curiosity gap',
      }),
    );
    // randomUUID gives each suggestion a unique id.
    const ids = new Set(result.suggestions.map((s) => s.id));
    expect(ids.size).toBe(3);
  });

  it('strips ```json fences before parsing', async () => {
    const fenced = '```json\n' + JSON.stringify(SAMPLE_SUGGESTIONS) + '\n```';
    const chat = jest.fn().mockResolvedValue({ content: fenced });
    const { svc } = makeService(chat);

    const result = await svc.suggest({ format: 'punch' });
    expect(result.suggestions).toHaveLength(3);
  });

  it('defaults estimatedScore to 5 when the model omits it', async () => {
    const chat = jest.fn().mockResolvedValue({
      content: JSON.stringify([{ text: 'tweet', reasoning: 'why' }]),
    });
    const { svc } = makeService(chat);

    const result = await svc.suggest({ format: 'punch' });
    expect(result.suggestions[0].estimatedScore).toBe(5);
    expect(result.suggestions[0].reasoning).toBe('why');
  });

  it('throws a friendly error on malformed JSON', async () => {
    const chat = jest.fn().mockResolvedValue({ content: 'gibberish' });
    const { svc } = makeService(chat);

    await expect(svc.suggest({ format: 'punch' })).rejects.toThrow(/invalid JSON for content suggestions/);
  });

  it('includes the storm-specific separator instruction when format=storm', async () => {
    const chat = jest.fn().mockResolvedValue({ content: JSON.stringify(SAMPLE_SUGGESTIONS) });
    const { svc, ai } = makeService(chat);

    await svc.suggest({ format: 'storm' });

    const messages = (ai.chat as jest.Mock).mock.calls[0][0] as Array<{ role: string; content: string }>;
    const userMsg = messages.find((m) => m.role === 'user')!;
    expect(userMsg.content).toContain('---TWEET---');
  });

  it('embeds the StyleProfile fields into the prompt when one is provided', async () => {
    const chat = jest.fn().mockResolvedValue({ content: JSON.stringify(SAMPLE_SUGGESTIONS) });
    const { svc, ai } = makeService(chat);

    const styleProfile: StyleProfile = {
      tone: ['witty', 'concise'],
      avgLength: 180,
      hashtagUsage: 0.1,
      emojiUsage: 0.2,
      topTopics: ['typescript', 'devtools'],
      contentStyle: 'short_punchy',
      postingPattern: 'daily',
      engagementStyle: 'replies fast',
      summary: 's',
    };
    await svc.suggest({ format: 'punch', topic: 'devtools', styleProfile });

    const userMsg = ((ai.chat as jest.Mock).mock.calls[0][0] as Array<{ role: string; content: string }>).find(
      (m) => m.role === 'user',
    )!;
    expect(userMsg.content).toContain('witty, concise');
    expect(userMsg.content).toContain('typescript, devtools');
    expect(userMsg.content).toContain('devtools'); // topic
  });
});
