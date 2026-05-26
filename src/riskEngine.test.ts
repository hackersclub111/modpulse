import { describe, it, expect } from 'vitest';
import { calculateRisk, formatRiskReport, type UserData } from './riskEngine.js';

const baseData: UserData = {
  username: 'testuser',
  posts: 0,
  comments: 0,
  warnings: 0,
  removals: 0,
  strikes: 0,
  karma: 1000,
  accountAgeDays: 365,
  subredditCount: 5,
  lastActivity: Date.now() - 3600000,
  firstSeen: new Date(Date.now() - 30 * 86400000).toISOString(),
};

describe('Risk Engine', () => {
  describe('calculateRisk', () => {
    it('should score clean user as low risk', () => {
      const result = calculateRisk({ ...baseData, posts: 10, comments: 15 });
      expect(result.score).toBeLessThan(35);
      expect(result.level).toBe('low');
      expect(result.recommendedAction).toBe('allow');
    });

    it('should flag new account (< 3 days)', () => {
      const result = calculateRisk({ ...baseData, accountAgeDays: 1, posts: 5, comments: 10 });
      expect(result.factors.some(f => f.name === 'Brand New Account')).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(20);
    });

    it('should flag new account (< 7 days)', () => {
      const result = calculateRisk({ ...baseData, accountAgeDays: 5, posts: 5, comments: 10 });
      expect(result.factors.some(f => f.name === 'New Account')).toBe(true);
    });

    it('should flag negative karma', () => {
      const result = calculateRisk({ ...baseData, karma: -150, posts: 5, comments: 10 });
      expect(result.factors.some(f => f.name === 'Severely Negative Karma')).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(30);
    });

    it('should flag moderate negative karma', () => {
      const result = calculateRisk({ ...baseData, karma: -80, posts: 5, comments: 10 });
      expect(result.factors.some(f => f.name === 'Negative Karma')).toBe(true);
    });

    it('should flag slightly negative karma', () => {
      const result = calculateRisk({ ...baseData, karma: -10, posts: 5, comments: 10 });
      expect(result.factors.some(f => f.name === 'Low Karma')).toBe(true);
    });

    it('should score high for multiple warnings', () => {
      const result = calculateRisk({ ...baseData, warnings: 4, posts: 20, comments: 30 });
      expect(result.score).toBeGreaterThanOrEqual(35);
      expect(result.factors.some(f => f.name === 'Warning History')).toBe(true);
    });

    it('should score for removals', () => {
      const result = calculateRisk({ ...baseData, removals: 3, posts: 20, comments: 30 });
      expect(result.factors.some(f => f.name === 'Content Removals')).toBe(true);
    });

    it('should score for strikes', () => {
      const result = calculateRisk({ ...baseData, strikes: 2, posts: 20, comments: 30 });
      expect(result.factors.some(f => f.name === 'Strike History')).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(30);
    });

    it('should detect rapid posting', () => {
      const result = calculateRisk({ ...baseData, lastActivity: Date.now() - 10000, posts: 10, comments: 10 });
      expect(result.factors.some(f => f.name === 'Rapid Posting')).toBe(true);
    });

    it('should detect high removal rate', () => {
      const result = calculateRisk({ ...baseData, posts: 3, comments: 2, removals: 4 });
      expect(result.factors.some(f => f.name === 'High Removal Rate')).toBe(true);
    });

    it('should detect single-sub spam', () => {
      const result = calculateRisk({ ...baseData, subredditCount: 1, posts: 15, comments: 5 });
      expect(result.factors.some(f => f.name === 'Single-Sub Activity')).toBe(true);
    });

    it('should score critical for worst case', () => {
      const result = calculateRisk({
        username: 'worst',
        posts: 3,
        comments: 2,
        warnings: 5,
        removals: 5,
        strikes: 3,
        karma: -200,
        accountAgeDays: 1,
        subredditCount: 1,
        lastActivity: Date.now() - 5000,
        firstSeen: new Date().toISOString(),
      });
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.level).toBe('critical');
      expect(result.recommendedAction).toBe('remove');
    });

    it('should never exceed 100', () => {
      const result = calculateRisk({
        username: 'max',
        posts: 0,
        comments: 0,
        warnings: 100,
        removals: 100,
        strikes: 100,
        karma: -9999,
        accountAgeDays: 0,
        subredditCount: 0,
        lastActivity: Date.now(),
        firstSeen: '',
      });
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should never go below 0', () => {
      const result = calculateRisk({
        username: 'perfect',
        posts: 1000,
        comments: 5000,
        warnings: 0,
        removals: 0,
        strikes: 0,
        karma: 100000,
        accountAgeDays: 3650,
        subredditCount: 50,
        lastActivity: Date.now() - 86400000 * 30,
        firstSeen: new Date(Date.now() - 365 * 86400000 * 10).toISOString(),
      });
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.level).toBe('low');
    });

    it('should handle zero-activity ghost user', () => {
      const result = calculateRisk({
        username: 'ghost',
        posts: 0,
        comments: 0,
        warnings: 0,
        removals: 0,
        strikes: 0,
        karma: 0,
        accountAgeDays: -1,
        subredditCount: 0,
        lastActivity: 0,
        firstSeen: '',
      });
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.level).toBe('low');
    });

    it('should weight warnings heavier than removals per unit', () => {
      const withWarnings = calculateRisk({ ...baseData, warnings: 2, posts: 15, comments: 20 });
      const withRemovals = calculateRisk({ ...baseData, removals: 2, posts: 15, comments: 20 });
      expect(withWarnings.score).toBeGreaterThan(withRemovals.score);
    });

    it('should accumulate multiple factors', () => {
      const single = calculateRisk({ ...baseData, warnings: 1, posts: 15, comments: 20 });
      const multi = calculateRisk({ ...baseData, warnings: 1, removals: 2, strikes: 1, posts: 15, comments: 20 });
      expect(multi.score).toBeGreaterThan(single.score);
      expect(multi.factors.length).toBeGreaterThan(single.factors.length);
    });
  });

  describe('formatRiskReport', () => {
    it('should include username', () => {
      const risk = calculateRisk({ ...baseData, posts: 5, comments: 10 });
      expect(formatRiskReport('testuser', risk)).toContain('u/testuser');
    });

    it('should include score and level', () => {
      const risk = calculateRisk({ ...baseData, warnings: 2, posts: 5, comments: 10 });
      const report = formatRiskReport('testuser', risk);
      expect(report).toContain(`${risk.score}/100`);
      expect(report).toContain(risk.level.toUpperCase());
    });

    it('should include user data when provided', () => {
      const data = { ...baseData, posts: 5, comments: 10, karma: 500, accountAgeDays: 90 };
      const risk = calculateRisk(data);
      const report = formatRiskReport('testuser', risk, data);
      expect(report).toContain('500'); // karma
      expect(report).toContain('90 days'); // account age
      expect(report).toContain('5 posts'); // post count
    });

    it('should list risk factors when present', () => {
      const data = { ...baseData, warnings: 3, removals: 2, strikes: 1, posts: 5, comments: 3 };
      const risk = calculateRisk(data);
      const report = formatRiskReport('testuser', risk, data);
      expect(report).toContain('Risk Factors');
      for (const f of risk.factors) {
        expect(report).toContain(f.name);
      }
    });

    it('should handle no factors case', () => {
      const data = { ...baseData, posts: 8, comments: 12 };
      const risk = calculateRisk(data);
      const report = formatRiskReport('cleanuser', risk, data);
      expect(report).toContain('No risk factors detected');
    });

    it('should include recommended action', () => {
      const risk = calculateRisk({ ...baseData, posts: 5, comments: 10 });
      const report = formatRiskReport('testuser', risk);
      expect(report).toContain(risk.recommendedAction.toUpperCase());
    });

    it('should sort factors by contribution descending', () => {
      const data = { ...baseData, warnings: 3, removals: 2, strikes: 1, karma: -100, posts: 5, comments: 3 };
      const risk = calculateRisk(data);
      const report = formatRiskReport('testuser', risk, data);
      const positions = risk.factors
        .sort((a, b) => b.contribution - a.contribution)
        .map(f => report.indexOf(f.name));
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]).toBeGreaterThan(positions[i - 1]);
      }
    });
  });

  describe('type interface validation', () => {
    it('should return valid RiskScore structure', () => {
      const result = calculateRisk({ ...baseData, posts: 10, comments: 20 });

      expect(typeof result.score).toBe('number');
      expect(typeof result.level).toBe('string');
      expect(Array.isArray(result.factors)).toBe(true);
      expect(typeof result.summary).toBe('string');
      expect(typeof result.recommendedAction).toBe('string');
      expect(typeof result.analyzedAt).toBe('string');

      expect(['low', 'medium', 'high', 'critical']).toContain(result.level);
      expect(['allow', 'watch', 'flag', 'remove']).toContain(result.recommendedAction);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);

      for (const f of result.factors) {
        expect(typeof f.name).toBe('string');
        expect(typeof f.weight).toBe('number');
        expect(typeof f.contribution).toBe('number');
        expect(typeof f.description).toBe('string');
        expect(f.contribution).toBeGreaterThan(0);
      }
    });
  });
});
