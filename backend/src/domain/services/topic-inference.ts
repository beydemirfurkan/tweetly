import type { TrendingRepo, Topic } from '@domain/types/content.types';

const TOPIC_RULES: Array<{ topic: Topic; pattern: RegExp }> = [
  { topic: 'ai-agents', pattern: /\b(agent|agentic|autonomous|crew|langchain|llamaindex|workflow.?engine|multi.?agent)\b/i },
  { topic: 'ai-coding', pattern: /\b(copilot|cursor|code.?gen|coding.?agent|ide|lsp|code.?assistant|code.?completion|pair.?program)\b/i },
  { topic: 'ai-models', pattern: /\b(llm|gpt|claude|gemini|transformer|embedding|model|diffusion|stable.?diffusion|whisper|tts)\b/i },
  { topic: 'dev-tools', pattern: /\b(cli|terminal|devtool|tool|framework|sdk|debugger|linter|formatter|build.?tool|bundler|package.?manager)\b/i },
  { topic: 'dev-infra', pattern: /\b(infra|deploy|kubernetes|docker|container|ci.?cd|terraform|ansible|cloud|serverless|k8s|helm)\b/i },
  { topic: 'frontend', pattern: /\b(react|vue|angular|svelte|css|tailwind|frontend|next.?js|nuxt|remix|astro|component|ui.?library)\b/i },
  { topic: 'backend', pattern: /\b(api|server|backend|database|sql|postgres|redis|graphql|rest|microservice|express|fastapi|django|rails)\b/i },
  { topic: 'data', pattern: /\b(data|analytics|ml|machine.?learning|pipeline|etl|spark|kafka|streaming|visualization|dashboard)\b/i },
  { topic: 'security', pattern: /\b(security|auth|encrypt|vulnerability|penetration|pentest|firewall|oauth|jwt|cors|xss)\b/i },
  { topic: 'open-source', pattern: /\b(open.?source|oss|license|community|contributing|maintainer)\b/i },
];

export function inferTopic(repo: TrendingRepo): Topic {
  const combined = `${repo.description ?? ''} ${repo.language ?? ''} ${repo.owner}/${repo.name}`;
  for (const rule of TOPIC_RULES) {
    if (rule.pattern.test(combined)) return rule.topic;
  }
  return 'other';
}
