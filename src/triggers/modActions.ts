// ModPulse — ModAction Trigger
// Tracks ALL mod actions across the team for accountability

import type { ModAction } from '@devvit/protos';
import type { TriggerContext } from '@devvit/public-api';
import { KEYS } from '../constants.js';

export async function handleModAction(event: ModAction, context: TriggerContext): Promise<void> {
  const { redis } = context;
  const now = Date.now();

  // Log the mod action
  const actionsRaw = await redis.get(KEYS.global.modActions());
  const actions = actionsRaw ? JSON.parse(actionsRaw) : [];

  actions.push({
    modId: event.moderator,
    action: event.action,
    subreddit: event.subreddit,
    timestamp: now,
  });

  // Keep last 100 actions
  if (actions.length > 100) actions.splice(0, actions.length - 100);
  await redis.set(KEYS.global.modActions(), JSON.stringify(actions));
}
