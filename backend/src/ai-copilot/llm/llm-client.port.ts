/**
 * Provider-agnostic chat-completion contract. Implementations adapt this to
 * a specific vendor (OpenRouter today; OpenAI / Anthropic / a self-hosted
 * model tomorrow). Consumers (ContentSuggester, ViralScorer, ProfileAnalyzer)
 * depend on this port — not on any concrete vendor SDK — so a provider swap
 * is one module-binding change.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCompletionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatCompletionResult {
  content: string;
  usage?: ChatCompletionUsage;
}

export interface ILlmClient {
  chat(messages: ChatMessage[], options?: ChatCompletionOptions): Promise<ChatCompletionResult>;
}

export const LLM_CLIENT = Symbol('ILlmClient');
