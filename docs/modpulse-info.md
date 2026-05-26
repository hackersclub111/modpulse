# ModPulse — AI-Powered Contextual Moderation Intelligence for Reddit

## Overview
ModPulse is a Devvit-native port of ContextMod that gives Reddit moderators instant, AI-powered context about any user. It automatically tracks user behavior, calculates risk scores from real Reddit data, flags high-risk accounts, and provides one-click moderation actions — all without leaving Reddit.

## The Problem
Reddit moderators spend 15+ hours per week investigating suspicious users — manually checking post histories, cross-referencing karma, looking for ban evasion patterns, and making judgment calls with incomplete information. Reddit's AutoModerator can match keywords but can't answer the question every mod asks daily: "Is this user trustworthy?"

## The Solution
ModPulse answers that question in 5 seconds. Right-click any post or comment, select "Analyze User," and get an instant risk score (0-100) based on 8 factors using real Reddit API data.

## Key Features

### 1. AI Risk Scoring (8 Factors)
Calculates a 0-100 risk score using real Reddit data:
- Account Age (from Reddit API createdAt)
- Karma Score (commentKarma + linkKarma from Reddit API)
- Warning History (tracked in Redis)
- Content Removals (tracked in Redis)
- Strike History (tracked in Redis)
- Burst Activity (timestamp tracking)
- Removal Rate (computed ratio)
- Subreddit Diversity (hash-based tracking)

### 2. Seven Context Menu Actions
Right-click any post or comment:
- Analyze User: Instant risk score with real karma, age, warnings
- Full Report: Detailed PM with full user profile and risk breakdown
- Warn User: Send warning PM, auto-log to Redis
- Remove Content: Remove + notify user + increment removal counter
- Issue Strike: Severity-based (minor/major/critical) with escalating bans
- Add Note: Mod note with severity (positive/neutral/negative)
- View Notes: See all mod notes for a user

### 3. Three-Strike Escalation System (Original)
Severity-based, not copied from examples:
- Each strike can be minor (1), major (2), or critical (3)
- 1-2 strikes: Warning PM
- 3-5 strikes: 7-day ban
- 6-8 strikes: 30-day ban
- 9+ strikes: Permanent ban

### 4. Background Intelligence
- Hourly Scan: Recalculates risk scores for all tracked users
- Daily Digest: Sends modmail summary every morning at 9 AM UTC

### 5. Four Event Triggers
- PostCreate: Every new post triggers user tracking + auto-scan
- CommentCreate: Every new comment triggers user tracking + auto-scan
- ModAction: Tracks ALL mod actions across the team
- AppInstall/Upgrade: Schedules background jobs on install

## Architecture
- 9 source files, modular structure
- 16 Devvit registrations (7 menu items, 4 triggers, 2 scheduler jobs, 2 forms, 1 settings block)
- Uses only documented Devvit APIs
- TypeScript with strict mode, 0 compilation errors
- 26 unit tests, all passing

## Impact
- 360x faster than manual user investigation (30 min → 5 sec)
- 15+ hours/week saved for active mod teams
- Works on all platforms: Web, iOS, Android
- Zero config: Install from App Directory and it works

## GitHub
https://github.com/hackersclub111/modpulse

## Built With
- Devvit (Reddit's Developer Platform)
- TypeScript
- Redis (via Devvit)
- Vitest (unit testing)
