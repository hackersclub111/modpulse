// ModPulse — Risk Scoring Engine
// Calculates risk scores using REAL Reddit user data + tracked behavior

export interface RiskScore {
  score: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
  summary: string;
  recommendedAction: 'allow' | 'watch' | 'flag' | 'remove';
  analyzedAt: string;
}

export interface RiskFactor {
  name: string;
  weight: number;
  contribution: number;
  description: string;
}

export interface UserData {
  username: string;
  posts: number;
  comments: number;
  warnings: number;
  removals: number;
  strikes: number;
  karma: number;
  accountAgeDays: number;
  subredditCount: number;
  lastActivity: number;
  firstSeen: string;
}

export function calculateRisk(data: UserData): RiskScore {
  const factors: RiskFactor[] = [];
  let score = 0;

  // Factor 1: Account Age (real Reddit data)
  if (data.accountAgeDays >= 0 && data.accountAgeDays < 3) {
    factors.push({ name: 'Brand New Account', weight: 0.20, contribution: 25, description: `Only ${data.accountAgeDays} day(s) old` });
    score += 25;
  } else if (data.accountAgeDays >= 0 && data.accountAgeDays < 7) {
    factors.push({ name: 'New Account', weight: 0.15, contribution: 15, description: `${data.accountAgeDays} days old` });
    score += 15;
  }

  // Factor 2: Karma (real Reddit data)
  if (data.karma < -100) {
    factors.push({ name: 'Severely Negative Karma', weight: 0.20, contribution: 30, description: `Karma: ${data.karma}` });
    score += 30;
  } else if (data.karma < -50) {
    factors.push({ name: 'Negative Karma', weight: 0.15, contribution: 20, description: `Karma: ${data.karma}` });
    score += 20;
  } else if (data.karma < 0) {
    factors.push({ name: 'Low Karma', weight: 0.10, contribution: 10, description: `Karma: ${data.karma}` });
    score += 10;
  }

  // Factor 3: Warning History (tracked)
  if (data.warnings > 0) {
    const penalty = Math.min(data.warnings * 12, 36);
    factors.push({ name: 'Warning History', weight: 0.15, contribution: penalty, description: `${data.warnings} warning(s)` });
    score += penalty;
  }

  // Factor 4: Removal History (tracked)
  if (data.removals > 0) {
    const penalty = Math.min(data.removals * 8, 24);
    factors.push({ name: 'Content Removals', weight: 0.12, contribution: penalty, description: `${data.removals} removal(s)` });
    score += penalty;
  }

  // Factor 5: Strikes (tracked)
  if (data.strikes > 0) {
    const penalty = Math.min(data.strikes * 15, 45);
    factors.push({ name: 'Strike History', weight: 0.18, contribution: penalty, description: `${data.strikes} strike(s)` });
    score += penalty;
  }

  // Factor 6: Burst Activity
  const now = Date.now();
  if (data.lastActivity > 0 && now - data.lastActivity < 60000) {
    factors.push({ name: 'Rapid Posting', weight: 0.10, contribution: 15, description: 'Active within last minute' });
    score += 15;
  }

  // Factor 7: Removal-to-Activity Ratio
  const total = data.posts + data.comments;
  if (total > 0 && data.removals > 0) {
    const ratio = data.removals / total;
    if (ratio > 0.5) {
      factors.push({ name: 'High Removal Rate', weight: 0.10, contribution: 20, description: `${Math.round(ratio * 100)}% removed` });
      score += 20;
    }
  }

  // Factor 8: Single-sub spam bot
  if (data.subredditCount === 1 && total > 10) {
    factors.push({ name: 'Single-Sub Activity', weight: 0.08, contribution: 12, description: `All ${total} activities in 1 subreddit` });
    score += 12;
  }

  score = Math.min(100, Math.max(0, score));

  let level: RiskScore['level'];
  if (score >= 80) level = 'critical';
  else if (score >= 60) level = 'high';
  else if (score >= 35) level = 'medium';
  else level = 'low';

  let recommendedAction: RiskScore['recommendedAction'];
  if (score >= 80) recommendedAction = 'remove';
  else if (score >= 60) recommendedAction = 'flag';
  else if (score >= 35) recommendedAction = 'watch';
  else recommendedAction = 'allow';

  return {
    score,
    level,
    factors,
    summary: factors.length > 0
      ? `Risk driven by: ${factors.map(f => f.name.toLowerCase()).join(', ')}`
      : 'No significant risk factors — user appears in good standing',
    recommendedAction,
    analyzedAt: new Date().toISOString(),
  };
}

export function formatRiskReport(username: string, risk: RiskScore, data?: UserData): string {
  const lines: string[] = [];
  const emoji = risk.level === 'critical' ? '🔴' : risk.level === 'high' ? '🟠' : risk.level === 'medium' ? '🟡' : '🟢';

  lines.push(`## ${emoji} ModPulse Analysis: u/${username}`);
  lines.push('');
  lines.push(`**Risk Score: ${risk.score}/100 (${risk.level.toUpperCase()})**`);
  lines.push(`**Action: ${risk.recommendedAction.toUpperCase()}**`);
  lines.push('');

  if (data) {
    lines.push('### User Profile');
    lines.push(`- Account Age: ${data.accountAgeDays >= 0 ? data.accountAgeDays + ' days' : 'Unknown'}`);
    lines.push(`- Karma: ${data.karma}`);
    lines.push(`- Tracked: ${data.posts} posts, ${data.comments} comments`);
    lines.push(`- Warnings: ${data.warnings} | Removals: ${data.removals} | Strikes: ${data.strikes}`);
    lines.push(`- Subreddits: ${data.subredditCount}`);
    lines.push('');
  }

  if (risk.factors.length > 0) {
    lines.push('### Risk Factors');
    for (const f of risk.factors.sort((a, b) => b.contribution - a.contribution)) {
      lines.push(`- **${f.name}** (+${f.contribution}): ${f.description}`);
    }
  } else {
    lines.push('No risk factors detected.');
  }

  lines.push('');
  lines.push(`*${risk.summary}*`);
  return lines.join('\n');
}
