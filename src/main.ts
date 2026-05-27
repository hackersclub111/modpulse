// ModPulse — Main Entry Point
// AI-Powered Contextual Moderation Intelligence for Reddit

import { Devvit, type MenuItemOnPressEvent, type User, type Post, type Comment } from '@devvit/public-api';
import { KEYS, JOB_NAMES } from './constants.js';
import { calculateRisk, formatRiskReport, type UserData } from './riskEngine.js';
import { handleCommentCreate, handlePostCreate } from './triggers/contentCreation.js';
import { handleModAction } from './triggers/modActions.js';
import { handleAppInstall } from './triggers/appLifecycle.js';
import { handleHourlyScan } from './scheduler/hourlyScan.js';
import { handleDailyDigest } from './scheduler/dailyDigest.js';

// ──────────────────────────────────────────────
// Configure
// ──────────────────────────────────────────────
Devvit.configure({
  redditAPI: true,
  redis: true,
});

// ──────────────────────────────────────────────
// Settings
// ──────────────────────────────────────────────
Devvit.addSettings([
  {
    name: 'riskThreshold',
    label: 'Risk Score Threshold',
    type: 'number',
    defaultValue: 70,
  },
  {
    name: 'autoRemoveThreshold',
    label: 'Auto-Remove Threshold',
    type: 'number',
    defaultValue: 85,
  },
  {
    name: 'enableAutoRemove',
    label: 'Enable Auto-Remove',
    type: 'boolean',
    defaultValue: false,
  },
]);

// ──────────────────────────────────────────────
// Triggers
// ──────────────────────────────────────────────
Devvit.addTrigger({
  events: ['AppInstall', 'AppUpgrade'],
  onEvent: handleAppInstall,
});

Devvit.addTrigger({
  event: 'PostCreate',
  onEvent: handlePostCreate,
});

Devvit.addTrigger({
  event: 'CommentCreate',
  onEvent: handleCommentCreate,
});

Devvit.addTrigger({
  event: 'ModAction',
  onEvent: handleModAction,
});

// ──────────────────────────────────────────────
// Scheduler Jobs
// ──────────────────────────────────────────────
Devvit.addSchedulerJob({
  name: JOB_NAMES.HOURLY_SCAN,
  onRun: handleHourlyScan,
});

Devvit.addSchedulerJob({
  name: JOB_NAMES.DAILY_DIGEST,
  onRun: handleDailyDigest,
});

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
async function getThing(event: MenuItemOnPressEvent, context: Devvit.Context): Promise<Post | Comment> {
  if (event.location === 'post') return await context.reddit.getPostById(event.targetId);
  return await context.reddit.getCommentById(event.targetId);
}

async function getAuthor(event: MenuItemOnPressEvent, context: Devvit.Context): Promise<User> {
  const thing = await getThing(event, context);
  const user = await context.reddit.getUserById(thing.authorId!);
  if (!user) throw new Error('Author not found');
  return user;
}

async function getUserData(userId: string, redis: any): Promise<UserData> {
  const [posts, comments, warnings, removals, strikes, karma, accountAge, lastActivity, firstSeen, subsRaw] = await Promise.all([
    redis.get(KEYS.user.posts(userId)).then((v: any) => parseInt(String(v || '0'))),
    redis.get(KEYS.user.comments(userId)).then((v: any) => parseInt(String(v || '0'))),
    redis.get(KEYS.user.warnings(userId)).then((v: any) => parseInt(String(v || '0'))),
    redis.get(KEYS.user.removals(userId)).then((v: any) => parseInt(String(v || '0'))),
    redis.get(KEYS.user.strikes(userId)).then((v: any) => parseInt(String(v || '0'))),
    redis.get(KEYS.user.karma(userId)).then((v: any) => parseInt(String(v || '0'))),
    redis.get(KEYS.user.accountAge(userId)).then((v: any) => parseInt(String(v || '-1'))),
    redis.get(KEYS.user.lastActivity(userId)).then((v: any) => parseInt(String(v || '0'))),
    redis.get(KEYS.user.firstSeen(userId)).then((v: any) => String(v || '')),
    redis.hGetAll(KEYS.user.subredditActivity(userId)),
  ]);

  const subs = subsRaw || {};

  return {
    username: userId,
    posts,
    comments,
    warnings,
    removals,
    strikes,
    karma,
    accountAgeDays: accountAge,
    subredditCount: Object.keys(subs).length,
    lastActivity,
    firstSeen,
  };
}

// ──────────────────────────────────────────────
// Menu Item 1: Analyze User
// ──────────────────────────────────────────────
async function analyzeUser(event: MenuItemOnPressEvent, context: Devvit.Context): Promise<void> {
  const author = await getAuthor(event, context);
  const data = await getUserData(author.id, context.redis);

  data.karma = author.commentKarma + author.linkKarma;
  data.accountAgeDays = Math.floor((Date.now() - new Date(author.createdAt).getTime()) / 86400000);

  await context.redis.set(KEYS.user.karma(author.id), data.karma.toString());
  await context.redis.set(KEYS.user.accountAge(author.id), data.accountAgeDays.toString());

  const risk = calculateRisk(data);
  await context.redis.set(KEYS.user.risk(author.id), JSON.stringify(risk));

  const emoji = risk.level === 'critical' ? '🔴' : risk.level === 'high' ? '🟠' : risk.level === 'medium' ? '🟡' : '🟢';
  context.ui.showToast(`${emoji} u/${author.username}: Risk ${risk.score}/100 | ${data.warnings}W ${data.removals}R ${data.strikes}S | Karma: ${data.karma} | Age: ${data.accountAgeDays}d`);
}

// ──────────────────────────────────────────────
// Menu Item 2: Full Report (PM to mod)
// ──────────────────────────────────────────────
async function fullReport(event: MenuItemOnPressEvent, context: Devvit.Context): Promise<void> {
  const author = await getAuthor(event, context);
  const data = await getUserData(author.id, context.redis);

  data.karma = author.commentKarma + author.linkKarma;
  data.accountAgeDays = Math.floor((Date.now() - new Date(author.createdAt).getTime()) / 86400000);

  const risk = calculateRisk(data);
  await context.redis.set(KEYS.user.risk(author.id), JSON.stringify(risk));

  const report = formatRiskReport(author.username, risk, data);
  const currentUser = await context.reddit.getCurrentUser();
  if (currentUser) {
    await context.reddit.sendPrivateMessage({
      to: currentUser.username,
      subject: `ModPulse Report: u/${author.username} — ${risk.score}/100`,
      text: report,
    });
  }
  context.ui.showToast(`📋 Full report sent to your inbox`);
}

// ──────────────────────────────────────────────
// Menu Item 3: Warn User
// ──────────────────────────────────────────────
async function warnUser(event: MenuItemOnPressEvent, context: Devvit.Context): Promise<void> {
  const author = await getAuthor(event, context);
  const subreddit = await context.reddit.getCurrentSubreddit();

  const warnCount = parseInt(String((await context.redis.get(KEYS.user.warnings(author.id))) || '0')) + 1;
  await context.redis.set(KEYS.user.warnings(author.id), warnCount.toString());
  await context.redis.hSet(KEYS.global.trackedUsers(), { [author.id]: Date.now().toString() });

  await context.reddit.sendPrivateMessage({
    to: author.username,
    subject: `Warning from r/${subreddit.name}`,
    text: `You have received warning #${warnCount} from the moderators of r/${subreddit.name}.\n\nPlease review the subreddit rules. Continued violations may result in escalation to temporary or permanent bans.`,
  });

  context.ui.showToast(`⚠️ Warning #${warnCount} sent to u/${author.username}`);
}

// ──────────────────────────────────────────────
// Menu Item 4: Remove Content
// ──────────────────────────────────────────────
async function removeContent(event: MenuItemOnPressEvent, context: Devvit.Context): Promise<void> {
  const author = await getAuthor(event, context);
  const thing = await getThing(event, context);
  const subreddit = await context.reddit.getCurrentSubreddit();

  await thing.remove();

  const removalCount = parseInt(String((await context.redis.get(KEYS.user.removals(author.id))) || '0')) + 1;
  await context.redis.set(KEYS.user.removals(author.id), removalCount.toString());

  await context.reddit.sendPrivateMessage({
    to: author.username,
    subject: `Content removed in r/${subreddit.name}`,
    text: `Your content has been removed by a moderator of r/${subreddit.name}.\n\nThis is removal #${removalCount} on your record. If you believe this is an error, please contact the moderators.`,
  });

  context.ui.showToast(`🗑️ Removed. u/${author.username} now has ${removalCount} removal(s).`);
}

// ──────────────────────────────────────────────
// Menu Item 5: Three-Strike System (ORIGINAL)
// ──────────────────────────────────────────────
const strikeForm = Devvit.createForm(
  () => ({
    fields: [
      { name: 'reason', label: 'Reason for strike', type: 'string' as const, required: true },
      {
        name: 'severity',
        label: 'Severity',
        type: 'select' as const,
        options: [
          { label: 'Minor (1 strike)', value: 'minor' },
          { label: 'Major (2 strikes)', value: 'major' },
          { label: 'Critical (3 strikes — ban)', value: 'critical' },
        ],
        defaultValue: ['minor'],
      },
    ],
    title: 'Issue Strike to User',
    acceptLabel: 'Issue Strike',
    cancelLabel: 'Cancel',
  }),
  async ({ values }, context) => {
    if (!context.commentId && !context.postId) {
      context.ui.showToast('No target found.');
      return;
    }

    const subreddit = await context.reddit.getCurrentSubreddit();
    let author: User;
    let thing: Post | Comment;

    if (context.commentId) {
      thing = await context.reddit.getCommentById(context.commentId);
      const u = await context.reddit.getUserById(thing.authorId!);
      if (!u) { context.ui.showToast('Author not found.'); return; }
      author = u;
    } else {
      thing = await context.reddit.getPostById(context.postId!);
      const u = await context.reddit.getUserById(thing.authorId!);
      if (!u) { context.ui.showToast('Author not found.'); return; }
      author = u;
    }

    await thing.remove();

    const severity = values.severity?.[0] || 'minor';
    const strikesToAdd = severity === 'critical' ? 3 : severity === 'major' ? 2 : 1;

    const currentStrikes = parseInt(String((await context.redis.get(KEYS.user.strikes(author.id))) || '0'));
    const totalStrikes = currentStrikes + strikesToAdd;
    await context.redis.set(KEYS.user.strikes(author.id), totalStrikes.toString());

    let banDays = 0;
    let pmMessage = '';

    if (totalStrikes >= 3) {
      pmMessage = `You have been permanently banned from r/${subreddit.name} after accumulating ${totalStrikes} strikes.\n\nReason: ${values.reason}`;
    } else if (totalStrikes === 2) {
      banDays = 30;
      pmMessage = `You have received a 30-day ban from r/${subreddit.name} (${totalStrikes} total strikes).\n\nReason: ${values.reason}\n\nOne more strike will result in a permanent ban.`;
    } else if (totalStrikes === 1) {
      banDays = 7;
      pmMessage = `You have received a 7-day ban from r/${subreddit.name} (${totalStrikes} total strikes).\n\nReason: ${values.reason}\n\nTwo more strikes will result in a permanent ban.`;
    } else {
      pmMessage = `You have received strike #${totalStrikes} in r/${subreddit.name}.\n\nReason: ${values.reason}\n\nThree strikes result in a permanent ban.`;
    }

    await context.reddit.sendPrivateMessage({
      to: author.username,
      subject: `Strike #${totalStrikes} — r/${subreddit.name}`,
      text: pmMessage,
    });

    if (banDays > 0 || totalStrikes >= 3) {
      try {
        const currentUser = await context.reddit.getCurrentUser();
        if (currentUser) {
          await context.reddit.banUser({
            subredditName: subreddit.name,
            username: author.username,
            duration: banDays || undefined,
            context: thing.id,
            reason: `${totalStrikes} strikes: ${values.reason}`,
            note: `Issued by ${currentUser.username}`,
          });
        }
      } catch { /* Ban might fail if app lacks permissions */ }
    }

    const banText = totalStrikes >= 3 ? 'PERMABAN' : banDays > 0 ? `${banDays}-day ban` : 'warning';
    context.ui.showToast(`⚡ Strike #${totalStrikes}: u/${author.username} — ${banText}`);
  }
);

// ──────────────────────────────────────────────
// Menu Item 6: Add Mod Note
// ──────────────────────────────────────────────
const addNoteForm = Devvit.createForm(
  () => ({
    fields: [
      { name: 'note', label: 'Mod Note', type: 'string' as const, required: true },
      {
        name: 'severity',
        label: 'Type',
        type: 'select' as const,
        options: [
          { label: 'Positive', value: 'positive' },
          { label: 'Neutral', value: 'neutral' },
          { label: 'Negative', value: 'negative' },
        ],
        defaultValue: ['neutral'],
      },
    ],
    title: 'Add Mod Note',
    acceptLabel: 'Save',
    cancelLabel: 'Cancel',
  }),
  async ({ values }, context) => {
    if (!context.commentId && !context.postId) {
      context.ui.showToast('No target found.');
      return;
    }

    let author: User;
    if (context.commentId) {
      const comment = await context.reddit.getCommentById(context.commentId);
      const u = await context.reddit.getUserById(comment.authorId!);
      if (!u) { context.ui.showToast('Author not found.'); return; }
      author = u;
    } else {
      const post = await context.reddit.getPostById(context.postId!);
      const u = await context.reddit.getUserById(post.authorId!);
      if (!u) { context.ui.showToast('Author not found.'); return; }
      author = u;
    }

    const currentUser = await context.reddit.getCurrentUser();
    const subreddit = await context.reddit.getCurrentSubreddit();

    const existing = await context.redis.get(KEYS.user.notes(author.id));
    const notes = existing ? JSON.parse(existing) : [];

    notes.push({
      mod: currentUser?.username || 'unknown',
      sub: subreddit.name,
      note: values.note,
      type: values.severity?.[0] || 'neutral',
      ts: Date.now(),
    });

    if (notes.length > 50) notes.splice(0, notes.length - 50);
    await context.redis.set(KEYS.user.notes(author.id), JSON.stringify(notes));

    context.ui.showToast(`📝 Note saved for u/${author.username}`);
  }
);

// ──────────────────────────────────────────────
// Menu Item 7: View Mod Notes
// ──────────────────────────────────────────────
async function viewNotes(event: MenuItemOnPressEvent, context: Devvit.Context): Promise<void> {
  const author = await getAuthor(event, context);
  const existing = await context.redis.get(KEYS.user.notes(author.id));
  const notes = existing ? JSON.parse(existing) : [];

  if (notes.length === 0) {
    context.ui.showToast(`📝 No notes for u/${author.username}`);
    return;
  }

  const recent = notes.slice(-5);
  const summary = recent.map((n: any) => `[${n.type}] ${n.note} — u/${n.mod}`).join(' | ');
  context.ui.showToast(`📝 u/${author.username} (${notes.length} notes): ${summary.substring(0, 200)}`);
}

// ──────────────────────────────────────────────
// Menu Items — 8 context menu actions
// ──────────────────────────────────────────────
Devvit.addMenuItem({
  label: '🔍 ModPulse: Analyze User',
  description: 'Get instant risk score with Reddit data',
  location: ['post', 'comment'],
  forUserType: 'moderator',
  onPress: analyzeUser,
});

Devvit.addMenuItem({
  label: '📋 ModPulse: Full Report',
  description: 'Send detailed user analysis to your inbox',
  location: ['post', 'comment'],
  forUserType: 'moderator',
  onPress: fullReport,
});

Devvit.addMenuItem({
  label: '⚠️ ModPulse: Warn User',
  description: 'Send warning PM and log it',
  location: ['post', 'comment'],
  forUserType: 'moderator',
  onPress: warnUser,
});

Devvit.addMenuItem({
  label: '🗑️ ModPulse: Remove Content',
  description: 'Remove and log with user notification',
  location: ['post', 'comment'],
  forUserType: 'moderator',
  onPress: removeContent,
});

Devvit.addMenuItem({
  label: '⚡ ModPulse: Issue Strike',
  description: 'Escalating consequences: warn → 7d ban → 30d ban → permaban',
  location: ['post', 'comment'],
  forUserType: 'moderator',
  onPress: (_, context) => context.ui.showForm(strikeForm),
});

Devvit.addMenuItem({
  label: '📝 ModPulse: Add Note',
  description: 'Add a mod note to this user',
  location: ['post', 'comment'],
  forUserType: 'moderator',
  onPress: (_, context) => context.ui.showForm(addNoteForm),
});

Devvit.addMenuItem({
  label: '📄 ModPulse: View Notes',
  description: 'View all mod notes for this user',
  location: ['post', 'comment'],
  forUserType: 'moderator',
  onPress: viewNotes,
});

// ──────────────────────────────────────────────
// Menu Item 8: View Subreddit Dashboard (UPGRADE)
// Creates a sticky post with live subreddit stats
// ──────────────────────────────────────────────
async function viewDashboard(event: MenuItemOnPressEvent, context: Devvit.Context): Promise<void> {
  const subreddit = await context.reddit.getCurrentSubreddit();
  const trackedUsersRaw = await context.redis.hGetAll(KEYS.global.trackedUsers());
  const trackedUsers = trackedUsersRaw || {};
  const userIds = Object.keys(trackedUsers);

  let totalWarnings = 0;
  let totalRemovals = 0;
  let totalStrikes = 0;
  let riskDistribution = { low: 0, medium: 0, high: 0, critical: 0 };

  for (const uid of userIds) {
    totalWarnings += parseInt(String((await context.redis.get(KEYS.user.warnings(uid))) || '0'));
    totalRemovals += parseInt(String((await context.redis.get(KEYS.user.removals(uid))) || '0'));
    totalStrikes += parseInt(String((await context.redis.get(KEYS.user.strikes(uid))) || '0'));

    const riskRaw = await context.redis.get(KEYS.user.risk(uid));
    if (riskRaw) {
      try {
        const risk = JSON.parse(riskRaw);
        if (risk.level in riskDistribution) riskDistribution[risk.level as keyof typeof riskDistribution]++;
      } catch { /* ignore parse errors */ }
    }
  }

  const report = [
    `## ModPulse Dashboard — r/${subreddit.name}`,
    '',
    `**Tracked Users:** ${userIds.length}`,
    `**Total Warnings:** ${totalWarnings}`,
    `**Total Removals:** ${totalRemovals}`,
    `**Total Strikes:** ${totalStrikes}`,
    '',
    '### Risk Distribution',
    `🟢 Low: ${riskDistribution.low} | 🟡 Medium: ${riskDistribution.medium} | 🟠 High: ${riskDistribution.high} | 🔴 Critical: ${riskDistribution.critical}`,
    '',
    `*Last updated: ${new Date().toISOString()}*`,
    '',
    '---',
    '*Powered by ModPulse — AI-Powered Contextual Moderation*',
  ].join('\n');

  // Send as modmail instead of creating a post (more appropriate)
  const currentUser = await context.reddit.getCurrentUser();
  if (currentUser) {
    await context.reddit.sendPrivateMessage({
      to: currentUser.username,
      subject: `📊 ModPulse Dashboard — r/${subreddit.name}`,
      text: report,
    });
  }
  context.ui.showToast(`📊 Dashboard sent to your inbox — ${userIds.length} users tracked`);
}

Devvit.addMenuItem({
  label: '📊 ModPulse: View Dashboard',
  description: 'Subreddit-wide risk stats sent to your inbox',
  location: ['post', 'comment'],
  forUserType: 'moderator',
  onPress: viewDashboard,
});

export default Devvit;
