import { describe, test, expect } from 'bun:test';
import { detectCompactionEvents } from '../src/classifier.ts';
import type { SessionMessage } from '../src/types.ts';

function assistant(inputTokens: number): SessionMessage {
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'ok' }],
      usage: {
        input_tokens: inputTokens,
        output_tokens: 100,
      },
    },
  };
}

function compactBoundary(preTokens: number): SessionMessage {
  return {
    type: 'system',
    subtype: 'compact_boundary',
    compactMetadata: { trigger: 'auto', preTokens },
    isMeta: true,
  };
}

describe('detectCompactionEvents', () => {
  test('detects marker-based compaction from compact_boundary', () => {
    const msgs: SessionMessage[] = [
      assistant(50_000),
      assistant(120_000),
      compactBoundary(150_000),
      assistant(30_000),
      assistant(40_000),
    ];
    const events = detectCompactionEvents(msgs);
    expect(events.length).toBe(1);
    expect(events[0]!.detection).toBe('marker');
    expect(events[0]!.tokensBefore).toBe(150_000);
    expect(events[0]!.tokensAfter).toBe(30_000);
    expect(events[0]!.tokensDropped).toBe(120_000);
  });

  test('falls back to heuristic when no marker present', () => {
    const msgs: SessionMessage[] = [
      assistant(150_000),
      assistant(160_000),
      assistant(20_000),
      assistant(25_000),
    ];
    const events = detectCompactionEvents(msgs);
    expect(events.length).toBe(1);
    expect(events[0]!.detection).toBe('heuristic');
    expect(events[0]!.tokensDropped).toBeGreaterThan(30_000);
  });

  test('returns empty array when no compaction', () => {
    const msgs: SessionMessage[] = [
      assistant(10_000),
      assistant(15_000),
      assistant(20_000),
    ];
    expect(detectCompactionEvents(msgs)).toEqual([]);
  });
});
