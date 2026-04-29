import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ContentFormat, TrendingRepo } from '../domain/types/content.types';
import {
  getSystemPrompt,
  userPromptForFormat,
  userPromptForDigest,
  RETRY_USER_NOTE,
  RETRY_THREAD_NOTE,
} from './prompt-registry';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MAX_TOKENS = 400;
const THREAD_MAX_TOKENS = 800;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_PRACTICAL_TWEET_LEN = 800;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

@Injectable()
export class OpenRouterService {
  private readonly log = new Logger(OpenRouterService.name);

  constructor(private readonly config: ConfigService) {}

  async chat(messages: ChatMessage[], maxTokens: number = DEFAULT_MAX_TOKENS): Promise<string> {
    const apiKey = this.config.get<string>('OPENROUTER_API_KEY');
    const model = this.config.get<string>('OPENROUTER_MODEL', 'google/gemini-flash-1.5');
    const referer = this.config.get<string>('OPENROUTER_REFERER', 'https://github.com/tweetly-bot');
    const appName = this.config.get<string>('OPENROUTER_APP_NAME', 'tweetly');

    if (!apiKey) throw new Error('OPENROUTER_API_KEY env var not set');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer,
          'X-Title': appName,
        },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: maxTokens }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`OpenRouter timeout after ${REQUEST_TIMEOUT_MS}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

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

  async generateTweet(repo: TrendingRepo, format: ContentFormat = 'repo_drop', extraContext?: string): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: getSystemPrompt(format) },
      { role: 'user', content: userPromptForFormat(format, repo, extraContext) },
    ];

    let text = clean(await this.chat(messages));

    if (text.length > MAX_PRACTICAL_TWEET_LEN) {
      messages.push({ role: 'assistant', content: text });
      messages.push({ role: 'user', content: RETRY_USER_NOTE });
      text = clean(await this.chat(messages));
    }

    if (text.length > MAX_PRACTICAL_TWEET_LEN) {
      throw new Error(`Tweet pratik uzunluk limitini aşıyor (${text.length}/${MAX_PRACTICAL_TWEET_LEN}): ${text.slice(0, 80)}…`);
    }
    if (!text) throw new Error('Boş tweet metni döndü');

    return text;
  }

  async generateThread(repo: TrendingRepo, repoUrl: string): Promise<string[]> {
    const messages: ChatMessage[] = [
      { role: 'system', content: getSystemPrompt('mini_thread') },
      { role: 'user', content: userPromptForFormat('mini_thread', repo) },
    ];

    let raw = clean(await this.chat(messages, THREAD_MAX_TOKENS));
    let tweets = raw.split(/\n*---\n*/).map((t) => t.trim()).filter(Boolean);

    if (tweets.length === 0 || tweets.some((t) => t.length > MAX_PRACTICAL_TWEET_LEN)) {
      messages.push({ role: 'assistant', content: raw });
      messages.push({ role: 'user', content: RETRY_THREAD_NOTE });
      raw = clean(await this.chat(messages, THREAD_MAX_TOKENS));
      tweets = raw.split(/\n*---\n*/).map((t) => t.trim()).filter(Boolean);
    }

    if (tweets.length === 0) throw new Error('Thread üretilemedi: boş cevap');

    const valid = tweets.filter((t) => t.length <= MAX_PRACTICAL_TWEET_LEN);
    if (valid.length === 0) throw new Error(`Thread tweet'leri pratik uzunluk limitini aşıyor`);

    const lastTweet = valid[valid.length - 1];
    const normalizedRepoUrl = repoUrl.toLocaleLowerCase('tr-TR');
    if (!lastTweet.includes(normalizedRepoUrl) && !lastTweet.includes('github.com')) {
      valid[valid.length - 1] = appendRepoUrl(lastTweet, repoUrl);
    }

    return valid.slice(0, 3);
  }

  async generateDigest(repos: TrendingRepo[]): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: getSystemPrompt('weekly_digest') },
      { role: 'user', content: userPromptForDigest(repos) },
    ];

    let text = clean(await this.chat(messages));

    if (text.length > MAX_PRACTICAL_TWEET_LEN) {
      messages.push({ role: 'assistant', content: text });
      messages.push({ role: 'user', content: RETRY_USER_NOTE });
      text = clean(await this.chat(messages));
    }

    if (text.length > MAX_PRACTICAL_TWEET_LEN) {
      throw new Error(`Digest pratik uzunluk limitini aşıyor (${text.length}/${MAX_PRACTICAL_TWEET_LEN})`);
    }

    return text;
  }
}

function clean(text: string): string {
  return text
    .replace(/^```[a-zA-Z0-9_-]*\s*/g, '')
    .replace(/\s*```$/g, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim()
    .toLocaleLowerCase('tr-TR');
}

function appendRepoUrl(lastTweet: string, repoUrl: string): string {
  const repoLine = `repo: ${repoUrl.toLocaleLowerCase('tr-TR')}`;
  const combined = `${lastTweet}\n\n${repoLine}`;
  if (combined.length <= MAX_PRACTICAL_TWEET_LEN) return combined;

  const maxTextLength = MAX_PRACTICAL_TWEET_LEN - repoLine.length - 2;
  if (maxTextLength <= 1) throw new Error('Thread son tweetine repo linki sigmiyor');

  return `${lastTweet.slice(0, maxTextLength - 1).trimEnd()}…\n\n${repoLine}`;
}
