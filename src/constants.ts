// ModPulse — Constants
// All job names, Redis key patterns, and config values

export const JOB_NAMES = {
  HOURLY_SCAN: 'modpulse:hourly_scan',
  DAILY_DIGEST: 'modpulse:daily_digest',
} as const;

// Redis key builders
export const KEYS = {
  user: {
    posts: (id: string) => `mp:posts:${id}`,
    comments: (id: string) => `mp:comments:${id}`,
    warnings: (id: string) => `mp:warnings:${id}`,
    removals: (id: string) => `mp:removals:${id}`,
    strikes: (id: string) => `mp:strikes:${id}`,
    lastActivity: (id: string) => `mp:last_act:${id}`,
    firstSeen: (id: string) => `mp:first_seen:${id}`,
    risk: (id: string) => `mp:risk:${id}`,
    notes: (id: string) => `mp:notes:${id}`,
    karma: (id: string) => `mp:karma:${id}`,
    accountAge: (id: string) => `mp:age:${id}`,
    flaggedAt: (id: string) => `mp:flagged_at:${id}`,
    subredditActivity: (id: string) => `mp:subs:${id}`,
  },
  global: {
    trackedUsers: () => 'mp:tracked_users',    // hSet: userId -> timestamp
    flaggedUsers: () => 'mp:flagged_users',    // hSet: userId -> riskScore
    modActions: () => 'mp:mod_actions',         // JSON string array
    stats: () => 'mp:stats',                    // JSON object
    installDate: () => 'mp:install_date',
  },
} as const;
