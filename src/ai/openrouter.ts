import { config, assertOpenRouter } from '../config';
import { getSystemPrompt, userPromptForFormat, userPromptForDigest, RETRY_USER_NOTE, RETRY_THREAD_NOTE } from './prompts';
import type { TrendingRepo, ContentFormat } from '../types';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function chat(messages: ChatMessage[]): Promise<string> {
  assertOpenRouter();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openrouter.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': config.openrouter.referer,
      'X-Title': config.openrouter.appName,
    },
    body: JSON.stringify({
      model: config.openrouter.model,
      messages,
      temperature: 0.7,
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as ChatResponse;
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error(`OpenRouter cevabı boş: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return content.trim();
}

function clean(text: string): string {
  return text.replace(/^["'`]+|["'`]+$/g, '').trim();
}

export async function generateTweet(
  repo: TrendingRepo,
  format: ContentFormat = 'repo_drop',
  extraContext?: string
): Promise<string> {
  const systemPrompt = getSystemPrompt(format);
  const userPrompt = userPromptForFormat(format, repo, extraContext);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let text = clean(await chat(messages));

  if (text.length > 280) {
    messages.push({ role: 'assistant', content: text });
    messages.push({ role: 'user', content: RETRY_USER_NOTE });
    text = clean(await chat(messages));
  }

  if (text.length > 280) {
    throw new Error(`Tweet 280 karakteri aşıyor (${text.length}): ${text.slice(0, 80)}…`);
  }
  if (!text) {
    throw new Error('Boş tweet metni döndü');
  }

  return text;
}

export async function generateThread(
  repo: TrendingRepo,
  repoUrl: string
): Promise<string[]> {
  const systemPrompt = getSystemPrompt('mini_thread');
  const userPrompt = userPromptForFormat('mini_thread', repo);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let raw = clean(await chat(messages));

  let tweets = raw.split(/\n*---\n*/).map((t) => t.trim()).filter(Boolean);

  if (tweets.length === 0 || tweets.some((t) => t.length > 280)) {
    messages.push({ role: 'assistant', content: raw });
    messages.push({ role: 'user', content: RETRY_THREAD_NOTE });
    raw = clean(await chat(messages));
    tweets = raw.split(/\n*---\n*/).map((t) => t.trim()).filter(Boolean);
  }

  if (tweets.length === 0) {
    throw new Error('Thread üretilemedi: boş cevap');
  }

  const valid = tweets.filter((t) => t.length <= 280);
  if (valid.length === 0) {
    throw new Error(`Thread tweet'leri 280 karakteri aşıyor`);
  }

  const lastTweet = valid[valid.length - 1];
  if (!lastTweet.includes(repoUrl) && !lastTweet.includes('github.com')) {
    valid[valid.length - 1] = `${lastTweet}\n\nrepo: ${repoUrl}`;
  }

  return valid.slice(0, 3);
}

export async function generateDigest(repos: TrendingRepo[]): Promise<string> {
  const systemPrompt = getSystemPrompt('weekly_digest');
  const userPrompt = userPromptForDigest(repos);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let text = clean(await chat(messages));

  if (text.length > 280) {
    messages.push({ role: 'assistant', content: text });
    messages.push({ role: 'user', content: RETRY_USER_NOTE });
    text = clean(await chat(messages));
  }

  if (text.length > 280) {
    throw new Error(`Digest 280 karakteri aşıyor (${text.length})`);
  }

  return text;
}
