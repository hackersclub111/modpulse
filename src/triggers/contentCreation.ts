// ModPulse — Content Creation Triggers
// Track every post and comment, auto-scan for high-risk users

import type { CommentCreate, PostCreate } from '@devvit/protos';
import type { TriggerContext } from '@devvit/public-api';
import { KEYS } from '../constants.js';
import { calculateRisk } from '../riskEngine.js';

export async function handleCommentCreate(event: CommentCreate, context: TriggerContext): Promise<void> {
  const commentId = event.comment?.id;
  if (!commentId) return;

  const comment = await context.reddit.getCommentById(commentId);
  const author = await context.reddit.getUserById(comment.authorId!);
  if (!author) return;

  const { redis } = context;
  const now = Date.now();

  const count = parseInt(String((await redis.get(KEYS.user.comments(author.id))) || '0')) + 1;
  await redis.set(KEYS.user.comments(author.id), count.toString());
  await redis.set(KEYS.user.lastActivity(author.id), now.toString());

  const firstSeen = await redis.get(KEYS.user.firstSeen(author.id));
  if (!firstSeen) {
    await redis.set(KEYS.user.firstSeen(author.id), new Date(now).toISOString());
    await redis.set(KEYS.user.karma(author.id), (author.commentKarma + author.linkKarma).toString());
    const ageMs = now - new Date(author.createdAt).getTime();
    await redis.set(KEYS.user.accountAge(author.id), Math.floor(ageMs / 86400000).toString());
  }

  const subredditId = event.comment?.subredditId;
  if (subredditId) {
    const existing = await redis.hGet(KEYS.user.subredditActivity(author.id), subredditId);
    await redis.hSet(KEYS.user.subredditActivity(author.id), { [subredditId]: (parseInt(String(existing || '0')) + 1).toString() });
  }

  // Track user
  await redis.hSet(KEYS.global.trackedUsers(), { [author.id]: now.toString() });

  await autoScan(author.id, author.username, context);
}

export async function handlePostCreate(event: PostCreate, context: TriggerContext): Promise<void> {
  const postId = event.post?.id;
  if (!postId) return;

  const post = await context.reddit.getPostById(postId);
  const author = await context.reddit.getUserById(post.authorId!);
  if (!author) return;

  const { redis } = context;
  const now = Date.now();

  const count = parseInt(String((await redis.get(KEYS.user.posts(author.id))) || '0')) + 1;
  await redis.set(KEYS.user.posts(author.id), count.toString());
  await redis.set(KEYS.user.lastActivity(author.id), now.toString());

  const firstSeen = await redis.get(KEYS.user.firstSeen(author.id));
  if (!firstSeen) {
    await redis.set(KEYS.user.firstSeen(author.id), new Date(now).toISOString());
    await redis.set(KEYS.user.karma(author.id), (author.commentKarma + author.linkKarma).toString());
    const ageMs = now - new Date(author.createdAt).getTime();
    await redis.set(KEYS.user.accountAge(author.id), Math.floor(ageMs / 86400000).toString());
  }

  const subredditId = event.post?.subredditId;
  if (subredditId) {
    const existing = await redis.hGet(KEYS.user.subredditActivity(author.id), subredditId);
    await redis.hSet(KEYS.user.subredditActivity(author.id), { [subredditId]: (parseInt(String(existing || '0')) + 1).toString() });
  }

  await redis.hSet(KEYS.global.trackedUsers(), { [author.id]: now.toString() });

  await autoScan(author.id, author.username, context);
}

async function autoScan(userId: string, username: string, context: TriggerContext): Promise<void> {
  const { redis } = context;

  const [posts, comments, warnings, removals, strikes, karma, accountAge, lastActivity, subsRaw] = await Promise.all([
    redis.get(KEYS.user.posts(userId)).then(v => parseInt(String(v || '0'))),
    redis.get(KEYS.user.comments(userId)).then(v => parseInt(String(v || '0'))),
    redis.get(KEYS.user.warnings(userId)).then(v => parseInt(String(v || '0'))),
    redis.get(KEYS.user.removals(userId)).then(v => parseInt(String(v || '0'))),
    redis.get(KEYS.user.strikes(userId)).then(v => parseInt(String(v || '0'))),
    redis.get(KEYS.user.karma(userId)).then(v => parseInt(String(v || '0'))),
    redis.get(KEYS.user.accountAge(userId)).then(v => parseInt(String(v || '-1'))),
    redis.get(KEYS.user.lastActivity(userId)).then(v => parseInt(String(v || '0'))),
    redis.hGetAll(KEYS.user.subredditActivity(userId)),
  ]);

  const subs = subsRaw || {};

  const risk = calculateRisk({
    username,
    posts,
    comments,
    warnings,
    removals,
    strikes,
    karma,
    accountAgeDays: accountAge,
    subredditCount: Object.keys(subs).length,
    lastActivity,
    firstSeen: '',
  });

  await redis.set(KEYS.user.risk(userId), JSON.stringify(risk));

  if (risk.score >= 80) {
    await redis.hSet(KEYS.global.flaggedUsers(), { [userId]: risk.score.toString() });
    await redis.set(KEYS.user.flaggedAt(userId), Date.now().toString());
  }
}
