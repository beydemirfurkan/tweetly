import { ViralScorerService } from '../viral-scorer.service';
import type { ILlmClient } from '../../llm/llm-client.port';

function makeService(mockChat: jest.Mock): {
  svc: ViralScorerService;
  ai: jest.Mocked<ILlmClient>;
} {
  const ai = { chat: mockChat } as unknown as jest.Mocked<ILlmClient>;
  const svc = new ViralScorerService(ai);
  return { svc, ai };
}

const VALID_SCORE_PAYLOAD = {
  score: 7.5,
  maxScore: 10,
  strengths: ['hook'],
  weaknesses: ['too long'],
  suggestions: ['shorter'],
  estimatedReach: '5K-50K',
  formatFit: 8,
  hookStrength: 7,
  readabilityScore: 9,
};

describe('ViralScorerService.score', () => {
  it('parses a clean JSON response from the model and returns the structured result', async () => {
    const chat = jest.fn().mockResolvedValue({ content: JSON.stringify(VALID_SCORE_PAYLOAD) });
    const { svc } = makeService(chat);

    const result = await svc.score({ text: 'great tweet', format: 'short_punchy', handle: 'alice' });
    expect(result).toEqual(VALID_SCORE_PAYLOAD);
  });

  it('strips markdown code fences before parsing', async () => {
    const fenced = '```json\n' + JSON.stringify(VALID_SCORE_PAYLOAD) + '\n```';
    const chat = jest.fn().mockResolvedValue({ content: fenced });
    const { svc } = makeService(chat);

    const result = await svc.score({ text: 'great tweet' });
    expect(result.score).toBe(7.5);
  });

  it('throws a friendly error when the model returns malformed JSON', async () => {
    const chat = jest.fn().mockResolvedValue({ content: 'not json at all' });
    const { svc } = makeService(chat);

    await expect(svc.score({ text: 'tweet' })).rejects.toThrow(/invalid JSON for viral score/);
  });

  it('forwards model temperature/maxTokens to the chat call', async () => {
    const chat = jest.fn().mockResolvedValue({ content: JSON.stringify(VALID_SCORE_PAYLOAD) });
    const { svc, ai } = makeService(chat);

    await svc.score({ text: 'tweet' });

    expect(ai.chat).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ temperature: 0.2, maxTokens: 2048 }),
    );
  });

  it('passes the tweet text + handle + format into the user prompt', async () => {
    const chat = jest.fn().mockResolvedValue({ content: JSON.stringify(VALID_SCORE_PAYLOAD) });
    const { svc, ai } = makeService(chat);

    await svc.score({ text: 'specific text', format: 'storm', handle: 'alice' });

    const messages = (ai.chat as jest.Mock).mock.calls[0][0] as Array<{ role: string; content: string }>;
    const userMsg = messages.find((m) => m.role === 'user')!;
    expect(userMsg.content).toContain('specific text');
    expect(userMsg.content).toContain('storm');
    expect(userMsg.content).toContain('@alice');
  });
});
