import { ACTION_TYPES } from '@domain/types/action.types';

export const TOOL_DEFINITIONS = [
  {
    name: 'post_tweet',
    description: 'Post a tweet from a Twitter/X account',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Tweet text (max 280 chars)' },
        account_id: { type: 'string', description: 'Account ID to post from (uses first active account if omitted)' },
        media_path: { type: 'string', description: 'Single-file convenience; prefer media_paths' },
        media_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Local file paths. Up to 4 images, or 1 video, or 1 GIF.',
        },
        alt_texts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Per-media accessibility text (best-effort, index-aligned with media_paths).',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'reply_to_tweet',
    description: 'Reply to a tweet',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Reply text' },
        parent_tweet_url: { type: 'string', description: 'URL of the tweet to reply to (must contain /status/)' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
      },
      required: ['text', 'parent_tweet_url'],
    },
  },
  {
    name: 'like_tweet',
    description: 'Like a tweet',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string', description: 'URL of the tweet to like (must contain /status/)' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'retweet_tweet',
    description: 'Retweet a tweet',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string', description: 'URL of the tweet to retweet (must contain /status/)' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'quote_tweet',
    description: 'Quote tweet with your own comment',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Your comment text' },
        tweet_url: { type: 'string', description: 'URL of the tweet to quote (must contain /status/)' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
      },
      required: ['text', 'tweet_url'],
    },
  },
  {
    name: 'bookmark_tweet',
    description: 'Bookmark a tweet',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string', description: 'URL of the tweet to bookmark (must contain /status/)' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'follow_account',
    description: 'Follow a Twitter/X account',
    inputSchema: {
      type: 'object',
      properties: {
        target_handle: { type: 'string', description: 'Handle of the account to follow (without @)' },
        account_id: { type: 'string', description: 'Account ID to follow from (optional)' },
      },
      required: ['target_handle'],
    },
  },
  {
    name: 'post_thread',
    description: 'Post multiple tweets as a thread',
    inputSchema: {
      type: 'object',
      properties: {
        tweets: { type: 'array', items: { type: 'string' }, description: 'Array of tweet texts' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
      },
      required: ['tweets'],
    },
  },
  {
    name: 'unlike_tweet',
    description: 'Remove a like from a tweet',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string' },
        account_id: { type: 'string' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'unretweet_tweet',
    description: 'Undo a retweet',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string' },
        account_id: { type: 'string' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'unfollow_account',
    description: 'Unfollow a Twitter/X account',
    inputSchema: {
      type: 'object',
      properties: {
        target_handle: { type: 'string' },
        account_id: { type: 'string' },
      },
      required: ['target_handle'],
    },
  },
  {
    name: 'delete_tweet',
    description: 'Delete a tweet permanently',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string' },
        account_id: { type: 'string' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'send_dm',
    description: 'Send a direct message to a Twitter/X user',
    inputSchema: {
      type: 'object',
      properties: {
        target_handle: { type: 'string' },
        message: { type: 'string' },
        account_id: { type: 'string' },
      },
      required: ['target_handle', 'message'],
    },
  },
  {
    name: 'update_profile',
    description: 'Update Twitter/X profile fields (name, bio, location, website)',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        bio: { type: 'string' },
        location: { type: 'string' },
        website: { type: 'string' },
        account_id: { type: 'string' },
      },
    },
  },
  {
    name: 'get_account_health',
    description:
      "Inspect a connected account's session health: auth-failure streak, last error, " +
      'pause state. Use to detect expired cookies before queueing more writes.',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Account ID (defaults to first active account)' },
      },
    },
  },
  {
    name: 'update_avatar',
    description: 'Replace the connected account profile photo from a local image file',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to a local image file (jpg/png)' },
        account_id: { type: 'string' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'update_banner',
    description: 'Replace the connected account profile banner/header image from a local file',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to a local image file' },
        account_id: { type: 'string' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'search_tweets',
    description: 'Search Twitter/X for tweets matching a query',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', description: 'Max results (default 20, max 50)' },
        account_id: { type: 'string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_user',
    description: 'Get a Twitter/X user profile',
    inputSchema: {
      type: 'object',
      properties: {
        handle: { type: 'string' },
        account_id: { type: 'string' },
      },
      required: ['handle'],
    },
  },
  {
    name: 'get_tweet',
    description: 'Get details of a specific tweet',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string' },
        account_id: { type: 'string' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'get_user_tweets',
    description: "Get a user's recent tweets",
    inputSchema: {
      type: 'object',
      properties: {
        handle: { type: 'string' },
        limit: { type: 'number' },
        account_id: { type: 'string' },
      },
      required: ['handle'],
    },
  },
  {
    name: 'search_users',
    description: 'Search for Twitter/X users by name or handle',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
        account_id: { type: 'string' },
        verified_only: { type: 'boolean', description: 'Return only verified users' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_user_followers',
    description: "Get a list of a user's followers",
    inputSchema: {
      type: 'object',
      properties: {
        handle: { type: 'string' },
        limit: { type: 'number' },
        account_id: { type: 'string' },
        verified_only: { type: 'boolean', description: 'Return only verified followers' },
      },
      required: ['handle'],
    },
  },
  {
    name: 'get_user_following',
    description: 'Get the list of accounts a user is following',
    inputSchema: {
      type: 'object',
      properties: {
        handle: { type: 'string' },
        limit: { type: 'number' },
        account_id: { type: 'string' },
        verified_only: { type: 'boolean' },
      },
      required: ['handle'],
    },
  },
  {
    name: 'get_tweet_retweeters',
    description: 'List the accounts that retweeted a given tweet',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string', description: 'URL of the tweet (must contain /status/)' },
        limit: { type: 'number' },
        account_id: { type: 'string' },
        verified_only: { type: 'boolean' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'get_tweet_quotes',
    description: 'List quote tweets of a given tweet',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string' },
        limit: { type: 'number' },
        account_id: { type: 'string' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'get_tweet_replies',
    description: 'List replies under a given tweet',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string' },
        limit: { type: 'number' },
        account_id: { type: 'string' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'get_user_mentions',
    description: 'Search for tweets that mention a specific user (@handle)',
    inputSchema: {
      type: 'object',
      properties: {
        handle: { type: 'string', description: 'User handle (with or without @)' },
        limit: { type: 'number' },
        account_id: { type: 'string' },
      },
      required: ['handle'],
    },
  },
  {
    name: 'get_x_trending',
    description: 'Get current trending topics on Twitter/X',
    inputSchema: {
      type: 'object',
      properties: { account_id: { type: 'string' } },
    },
  },
  {
    name: 'create_monitor',
    description: 'Monitor an account and receive webhook notifications when they post new tweets',
    inputSchema: {
      type: 'object',
      properties: {
        target_handle: { type: 'string' },
        webhook_url: { type: 'string' },
        account_id: { type: 'string' },
        event_types: {
          type: 'array',
          items: { type: 'string', enum: ['tweet.new'] },
        },
      },
      required: ['target_handle', 'webhook_url'],
    },
  },
  {
    name: 'list_monitors',
    description: 'List your monitors',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_monitor',
    description: 'Get monitor details and recent webhook deliveries',
    inputSchema: {
      type: 'object',
      properties: { monitor_id: { type: 'string' } },
      required: ['monitor_id'],
    },
  },
  {
    name: 'delete_monitor',
    description: 'Permanently delete a monitor',
    inputSchema: {
      type: 'object',
      properties: { monitor_id: { type: 'string' } },
      required: ['monitor_id'],
    },
  },
  {
    name: 'pause_monitor',
    description: 'Pause a monitor without deleting it',
    inputSchema: {
      type: 'object',
      properties: { monitor_id: { type: 'string' } },
      required: ['monitor_id'],
    },
  },
  {
    name: 'get_accounts',
    description: 'List your configured Twitter/X accounts',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'connect_x_account',
    description:
      'Queue a server-side login job that connects a new X account using username/password ' +
      '(plus optional TOTP base32 secret). Returns a job_id; call get_x_login_job to poll status. ' +
      'Typical login takes 20-40 seconds. Credentials are encrypted at rest; the password is wiped ' +
      'after the login completes. Set save_totp_secret=true to persist the TOTP secret for future reauth.',
    inputSchema: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'X handle (without @)' },
        email: { type: 'string', description: 'Optional unless X asks for an unusual-login challenge' },
        password: { type: 'string' },
        totp_secret: { type: 'string', description: 'Base32 TOTP secret (NOT the 6-digit code)' },
        save_totp_secret: { type: 'boolean', default: false },
      },
      required: ['username', 'password'],
    },
  },
  {
    name: 'reauth_x_account',
    description:
      'Re-authenticate an existing connected X account whose session has expired. Same flow as ' +
      'connect_x_account but writes the new cookies onto an existing account row. The login must ' +
      'resolve to the same handle as account_id; otherwise the job fails with invalid_credentials.',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'The X handle of the account being re-authed' },
        password: { type: 'string' },
        totp_secret: { type: 'string', description: 'Optional; reuses stored secret if account opted in' },
        save_totp_secret: { type: 'boolean', default: false },
        email: { type: 'string', description: 'Optional; updates stored email' },
      },
      required: ['account_id', 'password'],
    },
  },
  {
    name: 'get_x_login_job',
    description: 'Poll a connect_x_account or reauth_x_account job. Returns status: queued|running|success|failed.',
    inputSchema: {
      type: 'object',
      properties: { job_id: { type: 'string' } },
      required: ['job_id'],
    },
  },
  {
    name: 'list_actions',
    description: 'List your actions filtered by type/status/account',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ACTION_TYPES },
        status: { type: 'string' },
        account_id: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['type'],
    },
  },
  {
    name: 'cancel_action',
    description: 'Cancel a pending action',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ACTION_TYPES },
        action_id: { type: 'string' },
      },
      required: ['type', 'action_id'],
    },
  },
  {
    name: 'replay_action',
    description: 'Replay a failed or dead action',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ACTION_TYPES },
        action_id: { type: 'string' },
      },
      required: ['type', 'action_id'],
    },
  },
  {
    name: 'get_settings',
    description: 'Get account-scoped settings',
    inputSchema: {
      type: 'object',
      properties: { account_id: { type: 'string' } },
      required: ['account_id'],
    },
  },
  {
    name: 'update_settings',
    description: 'Update account-scoped settings',
    inputSchema: {
      type: 'object',
      properties: {
        settings: { type: 'object' },
        account_id: { type: 'string' },
      },
      required: ['settings', 'account_id'],
    },
  },
] as const;
