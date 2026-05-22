import { toJSONSchema } from 'zod';
import { TOOL_SCHEMAS, type ToolName } from './tool-schemas';

/**
 * Tool catalogue exposed to MCP clients. Derived from TOOL_SCHEMAS at module
 * load — the Zod schema is the single source of truth for both validation
 * and the JSON Schema clients see. Field descriptions come from `.describe()`
 * calls on each Zod field; tool-level descriptions live in the map below
 * because they describe the action, not any specific argument.
 *
 * Adding a tool: register it in TOOL_SCHEMAS and add a one-line entry to
 * TOOL_DESCRIPTIONS. The drift spec asserts the maps stay aligned.
 */

const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  // Queue-backed writes (original 8)
  post_tweet: 'Post a tweet from a Twitter/X account',
  reply_to_tweet: 'Reply to a tweet',
  like_tweet: 'Like a tweet',
  retweet_tweet: 'Retweet a tweet',
  quote_tweet: 'Quote tweet with your own comment',
  bookmark_tweet: 'Bookmark a tweet',
  follow_account: 'Follow a Twitter/X account',
  post_thread: 'Post a multi-tweet thread (5s spacing between tweets)',

  // Queue-backed writes (sprint-added 8)
  unlike_tweet: 'Remove your like from a tweet',
  unretweet_tweet: 'Undo a retweet',
  unfollow_account: 'Unfollow an X account',
  delete_tweet: 'Delete one of your tweets',
  send_dm: 'Send a direct message',
  update_profile: 'Update profile fields (name/bio/location/website)',
  update_avatar: 'Replace the account avatar from a local image',
  update_banner: 'Replace the account banner from a local image',

  // Reads
  search_tweets: 'Live search for tweets matching a query',
  get_user: 'Get a user profile (display name, bio, counts, verified)',
  get_tweet: 'Get full tweet details by URL',
  get_user_tweets: "List a user's recent tweets",
  search_users: 'Search users by name or handle',
  get_user_followers: "List a user's followers",
  get_user_following: "List the accounts a user follows",
  get_tweet_retweeters: 'List accounts that retweeted a tweet',
  get_tweet_quotes: 'List quote tweets of a tweet',
  get_tweet_replies: 'List replies to a tweet',
  get_user_mentions: 'Search recent tweets mentioning a handle',
  get_x_trending: 'Get current X trending topics for the active session region',
  get_user_likes: 'List tweets a user has publicly liked',
  get_my_bookmarks: "List the calling account's own bookmarks",
  get_list_members: 'List members of a public X list (by numeric list ID)',
  get_mutual_followers: "Followers-you-know: accounts the caller follows that also follow the target handle",
  get_thread: 'Get the same-author thread chain rooted at a tweet (root tweet first)',
  get_user_lists: 'Lists owned by a user (name, description, member count, owner)',
  get_list: 'Get list metadata (name, description, member + subscriber counts, owner)',
  get_list_subscribers: 'Get subscribers of a public X list (paginated)',

  // Monitors
  create_monitor: 'Create a webhook monitor for a target handle',
  list_monitors: 'List all monitors visible to the caller',
  get_monitor: 'Get a monitor + recent webhook deliveries',
  rotate_secret: 'Rotate a monitor webhook secret and return the new secret once',
  delete_monitor: 'Delete a monitor',
  pause_monitor: 'Pause a monitor (stops polling without deleting)',

  create_extraction:
    'Queue a bulk extraction job that drives a cursor-paginated read endpoint until max_rows. Output is JSONL on disk; download via REST.',
  get_extraction: 'Get an extraction job status + metadata (rows extracted, file path, error if any)',
  list_extractions: "List the caller's recent extraction jobs",
  cancel_extraction: 'Cancel a queued or running extraction job',

  // Accounts / login / actions / settings
  get_accounts: 'List connected X accounts (handle, status, session health)',
  get_account_health: 'Per-account session health snapshot',
  connect_x_account: 'Server-side login: queues a job that connects a new account',
  reauth_x_account: 'Re-authenticate an existing connected account',
  get_x_login_job: 'Poll a connect/reauth login job',
  list_actions: 'List queued actions filtered by type/status/account',
  cancel_action: 'Cancel a pending action',
  replay_action: 'Requeue a dead/failed/cancelled action',
  get_settings: 'Per-account settings snapshot',
  update_settings: 'Upsert per-account settings (key-value map)',
};

interface ToolDefinition {
  name: ToolName;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
    [key: string]: unknown;
  };
}

function buildDefinitions(): ToolDefinition[] {
  return (Object.keys(TOOL_SCHEMAS) as ToolName[]).map((name) => {
    const schema = TOOL_SCHEMAS[name];
    // `io: 'input'` so clients see the schema for what they should SEND, not
    // the post-transform value. `unrepresentable: 'any'` lets us keep
    // .transform()/.pipe() chains in the Zod source without crashing the
    // export — the affected fields fall back to `{}` (any) which is
    // accurate: they accept any string and the server normalises.
    const json = toJSONSchema(schema, {
      io: 'input',
      unrepresentable: 'any',
    }) as Record<string, unknown>;
    delete json.$schema;
    if (json.type !== 'object') {
      json.type = 'object';
    }
    return {
      name,
      description: TOOL_DESCRIPTIONS[name],
      inputSchema: json as ToolDefinition['inputSchema'],
    };
  });
}

export const TOOL_DEFINITIONS: ReadonlyArray<ToolDefinition> = buildDefinitions();
