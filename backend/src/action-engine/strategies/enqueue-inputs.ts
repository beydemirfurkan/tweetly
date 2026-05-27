import type { ActionEnqueueBase } from './action-strategy.port';

export interface EnqueuePostInput extends ActionEnqueueBase {
  text: string;
  mediaPath?: string | null;
  mediaPaths?: string[] | null;
  altTexts?: string[] | null;
}

export interface EnqueueReplyInput extends ActionEnqueueBase {
  text: string;
  parentTweetUrl: string;
}

export interface EnqueueEngagementInput extends ActionEnqueueBase {
  targetTweetUrl: string;
}

export interface EnqueueFollowInput extends ActionEnqueueBase {
  targetHandle: string;
}

export interface EnqueueQuoteInput extends ActionEnqueueBase {
  text: string;
  targetTweetUrl: string;
}

export interface EnqueueDmInput extends ActionEnqueueBase {
  targetHandle: string;
  message: string;
}

export interface EnqueueProfileUpdateInput extends ActionEnqueueBase {
  fields: Record<string, unknown>;
}

export interface EnqueueProfileImageInput extends ActionEnqueueBase {
  filePath: string;
}
