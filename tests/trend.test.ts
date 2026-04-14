import { describe, test, expect } from 'bun:test';
import { summarizeTrend } from '../src/trend.ts';
import type { TrendRecord } from '../src/types.ts';

function rec(percent: number, topCategory: TrendRecord['topCategory'] = 'tools'): TrendRecord {
  return {
    sessionId: Math.random().toString(36).slice(2),
    projectName: 'test',
    timestamp: new Date().toISOString(),
    totalTokens: Math.round(percent * 2000),
    percentUsed: percent,
    messageCount: 100,
    compactionCount: 0,
    health: percent < 50 ? 'healthy' : percent < 70 ? 'warming' : percent < 85 ? 'hot' : 'critical',
    topCategory,
    topCategoryTokens: 50_000,
  };
}

describe('summarizeTrend', () => {
  test('empty records returns zeroed summary', () => {
    const s = summarizeTrend([]);
    expect(s.count).toBe(0);
    expect(s.direction).toBe('flat');
    expect(s.series).toEqual([]);
  });

  test('detects worsening trend when percent rises >5pp', () => {
    const records = [rec(20), rec(25), rec(22), rec(50), rec(55), rec(60)];
    const s = summarizeTrend(records);
    expect(s.direction).toBe('worsening');
    expect(s.percentUsedDelta).toBeGreaterThan(5);
  });

  test('detects improving trend when percent falls >5pp', () => {
    const records = [rec(70), rec(65), rec(72), rec(30), rec(25), rec(20)];
    const s = summarizeTrend(records);
    expect(s.direction).toBe('improving');
    expect(s.percentUsedDelta).toBeLessThan(-5);
  });

  test('flat trend when delta is small', () => {
    const records = [rec(50), rec(51), rec(52), rec(51), rec(50), rec(52)];
    const s = summarizeTrend(records);
    expect(s.direction).toBe('flat');
  });

  test('picks dominant category by frequency', () => {
    const records = [
      rec(50, 'tools'),
      rec(50, 'tools'),
      rec(50, 'tools'),
      rec(50, 'retrieved'),
      rec(50, 'conversation'),
    ];
    expect(summarizeTrend(records).dominantCategory).toBe('tools');
  });
});
