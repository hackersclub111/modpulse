// ModPulse — Hourly Scan Job
// Recalculates risk scores for all tracked users

import type { TriggerContext } from '@devvit/public-api';
import { KEYS, JOB_NAMES } from '../constants.js';
import { calculateRisk } from '../riskEngine.js';

export async function handleHourlyScan(_event: unknown, context: TriggerContext): Promise<void> {
  const { redis, scheduler } = context;

  // Get tracked users from hash
  const trackedMap = await redis.hGetAll(KEYS.global.trackedUsers());
  const trackedUserIds = Object.keys(trackedMap);
  let flaggedCount = 0;

  for (const userId of trackedUserIds) {
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
      firstSeen: '',
    });

    await redis.set(KEYS.user.risk(userId), JSON.stringify(risk));

    if (risk.score >= 80) {
      await redis.hSet(KEYS.global.flaggedUsers(), { [userId]: risk.score.toString() });
      flaggedCount++;
    }
  }

  // Store scan stats
  await redis.set(KEYS.global.stats(), JSON.stringify({
    lastScan: new Date().toISOString(),
    usersScanned: trackedUserIds.length,
    flaggedCount,
  }));

  // Schedule next scan
  await scheduler.runJob({
    name: JOB_NAMES.HOURLY_SCAN,
    data: {},
    runAt: new Date(Date.now() + 3600000),
  });
}
