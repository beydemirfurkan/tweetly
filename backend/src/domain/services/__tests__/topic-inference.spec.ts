import { inferTopic } from '../topic-inference';
import type { TrendingRepo } from '@domain/types/content.types';

function repo(description: string, owner = 'test', name = 'repo', language = ''): TrendingRepo {
  return { owner, name, slug: `${owner}/${name}`, url: `https://github.com/${owner}/${name}`, description, language, starsToday: 10, totalStars: 500 };
}

describe('inferTopic', () => {
  it('ai-agents: agent keyword', () => {
    expect(inferTopic(repo('multi-agent orchestration framework'))).toBe('ai-agents');
  });

  it('ai-coding: cursor keyword', () => {
    expect(inferTopic(repo('cursor extension for better completions'))).toBe('ai-coding');
  });

  it('ai-models: llm keyword', () => {
    expect(inferTopic(repo('fine-tune LLM on custom dataset'))).toBe('ai-models');
  });

  it('dev-tools: cli keyword', () => {
    expect(inferTopic(repo('a CLI tool for managing dotfiles'))).toBe('dev-tools');
  });

  it('frontend: react keyword', () => {
    expect(inferTopic(repo('react component library with Tailwind'))).toBe('frontend');
  });

  it('backend: postgres keyword', () => {
    expect(inferTopic(repo('postgres query builder with type safety'))).toBe('backend');
  });

  it('other: no match', () => {
    expect(inferTopic(repo('general purpose utility'))).toBe('other');
  });

  it('uses language field', () => {
    expect(inferTopic(repo('', 'test', 'repo', 'TypeScript'))).toBe('other');
  });
});
