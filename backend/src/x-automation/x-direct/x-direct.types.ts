export interface TweetResult {
  url: string;
  text: string;
  handle: string;
  displayName: string;
  likeCount: string;
  retweetCount: string;
  replyCount: string;
  postedAt: string;
}

export interface UserResult {
  handle: string;
  displayName: string;
  bio: string;
  followersCount: string;
  followingCount: string;
  tweetsCount: string;
  verified: boolean;
  profileUrl: string;
  profileImageUrl: string;
}

export interface UserListItem {
  handle: string;
  displayName: string;
  bio: string;
  verified: boolean;
}

export interface DryRunFlag {
  dryRun?: boolean;
}

export interface ListMetaItem {
  listId: string;
  name: string;
  description: string;
  memberCount: string;
  ownerHandle: string;
  url: string;
}

export interface ListDetailItem {
  listId: string;
  name: string;
  description: string;
  memberCount: string;
  subscriberCount: string;
  ownerHandle: string;
  ownerDisplayName: string;
  url: string;
}
