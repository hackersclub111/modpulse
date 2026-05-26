// ModPulse — App Lifecycle Triggers
// Runs when the app is installed or upgraded

import type { AppInstall, AppUpgrade } from '@devvit/protos';
import type { TriggerContext } from '@devvit/public-api';
import { KEYS, JOB_NAMES } from '../constants.js';

export async function handleAppInstall(event: AppInstall | AppUpgrade, context: TriggerContext): Promise<void> {
  const { redis, scheduler } = context;
  const now = Date.now();

  // Store install date
  await redis.set(KEYS.global.installDate(), new Date(now).toISOString());

  // Schedule hourly scan
  await scheduler.runJob({
    name: JOB_NAMES.HOURLY_SCAN,
    data: {},
    runAt: new Date(now + 3600000),
  });

  // Schedule daily digest at 9 AM UTC
  const next = new Date();
  next.setUTCHours(9, 0, 0, 0);
  if (next <= new Date()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  await scheduler.runJob({
    name: JOB_NAMES.DAILY_DIGEST,
    data: {},
    runAt: next,
  });
}
