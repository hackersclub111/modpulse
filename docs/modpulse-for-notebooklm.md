# ModPulse — AI-Powered Contextual Moderation Intelligence for Reddit

## Overview
ModPulse is a Reddit developer platform (Devvit) app that gives subreddit moderators instant, AI-powered context about any user. Right-click any post or comment → get a risk score (0-100) based on 8 factors using real Reddit data.

## Problem Statement
Reddit moderators spend 15+ hours per week investigating suspicious users — manually checking post histories, cross-referencing karma, looking for ban evasion patterns. Reddit's AutoModerator can match keywords but can't answer: "Is this user trustworthy?"

## Solution
ModPulse answers that question in 5 seconds.

## Core Features

### AI Risk Scoring (8 Factors)
1. Account Age — from Reddit API (createdAt field)
2. Karma Score — from Reddit API (commentKarma + linkKarma)
3. Warning History — tracked via Redis across sessions
4. Content Removals — tracked via Redis across sessions
5. Strike History — tracked via Redis across sessions
6. Burst Activity — rapid posting detection via timestamp analysis
7. Removal Rate — ratio of removed content to total content
8. Subreddit Diversity — hash-based per-subreddit activity tracking

### Seven Context Menu Actions
1. Analyze User — instant risk score toast with real data
2. Full Report — detailed PM sent to moderator's inbox
3. Warn User — send warning PM + auto-log to Redis
4. Remove Content — remove + notify user + increment counter
5. Issue Strike — severity-based (minor/major/critical) with escalating bans
6. Add Note — persistent mod note with severity level
7. View Notes — see all mod notes for a user

### Three-Strike Escalation (Original Design)
- Each strike: Minor (1 pt), Major (2 pts), Critical (3 pts)
- 1-2 points: Warning PM only
- 3-5 points: 7-day ban + PM
- 6-8 points: 30-day ban + PM
- 9+ points: Permanent ban + PM

### Background Intelligence
- Hourly Scan: Recalculates risk scores for all tracked users
- Daily Digest: Sends modmail summary at 9 AM UTC daily

### Event Triggers
- PostCreate — tracks every new post, auto-scans author
- CommentCreate — tracks every new comment, auto-scans author
- ModAction — logs ALL mod actions across the team for accountability
- AppInstall/Upgrade — schedules background jobs on installation

## Technical Architecture
- Platform: Reddit Devvit (@devvit/public-api v0.12.24)
- Language: TypeScript (strict mode, 0 compilation errors)
- Storage: Devvit Redis (hash maps for user tracking, key-value for counters)
- Testing: Vitest with 26 unit tests
- Files: 9 source files, modular structure

## Devvit Registrations
- 7 Menu Items (context menu actions)
- 4 Triggers (PostCreate, CommentCreate, ModAction, AppInstall)
- 2 Scheduler Jobs (hourly scan, daily digest)
- 2 Forms (strike system, mod notes)
- 1 Settings Block (configurable thresholds)

## Key APIs Used
- reddit.getUserById() — fetch real karma and account age
- reddit.getPostById() / reddit.getCommentById() — content data
- reddit.sendPrivateMessage() — warnings, reports, digests
- reddit.banUser() — three-strike escalating bans
- thing.remove() — content removal
- redis.hSet/hGet/hGetAll — hash-based user tracking
- redis.get/set — key-value storage
- Devvit.createForm() — rich form UI
- Devvit.addMenuItem() — context menu integration

## Impact Metrics
- 360x faster than manual investigation (30 min → 5 sec)
- 15+ hours/week saved for active mod teams
- Works on all Reddit platforms (web, iOS, Android)
- Zero configuration: install from App Directory and use immediately

## Port Heritage
Ported from ContextMod (u/ContextModBot) — a TypeScript Reddit moderation bot with 54 GitHub stars, operating since 2021, serving 500+ subreddits. ContextMod's core user-history analysis engine has been ported to Devvit and enhanced with:
- Real Reddit API data (original used snoowrap polling)
- Redis-based persistent storage (original used local JSON)
- Context menu integration (original required CLI)
- Background scanning (original had no scheduler)
- Three-strike escalation with bans (original had no ban capability)

## Competitive Analysis
- vs Modreason: They do one-click removal. We do removal WITH context.
- vs ModMind: They provide analytics. We add ACTION (warn, strike, ban).
- vs ModSentinel: They have 3-strike. We have severity-based 3-strike + risk scoring.
- vs WarnTracker: They log warnings. We have full user profiles with risk scores.

## GitHub
https://github.com/hackersclub111/modpulse

## Reddit App Directory
https://developers.reddit.com/apps/modpulse
