import { describe, test, expect } from 'bun:test';
import { parseContextOutput } from '../src/calibrator.ts';

describe('parseContextOutput', () => {
  test('parses standard /context output', () => {
    const input = `
      System prompt:  11,200 tokens
      System tools:   14,600 tokens
      Custom agents:      0 tokens
      Memory files:     800 tokens
      MCP tools:          0 tokens
      Messages:      98,000 tokens
      Free space:    74,400 tokens
      Total:        200,000 tokens
    `;
    const parsed = parseContextOutput(input);
    expect(parsed).not.toBeNull();
    expect(parsed!.buckets.system_prompt).toBe(11_200);
    expect(parsed!.buckets.system_tools).toBe(14_600);
    expect(parsed!.buckets.memory_files).toBe(800);
    expect(parsed!.buckets.messages).toBe(98_000);
    expect(parsed!.buckets.free_space).toBe(74_400);
    expect(parsed!.total_capacity).toBe(200_000);
  });

  test('handles numbers without commas or units', () => {
    const parsed = parseContextOutput('System prompt: 11200\nMessages: 50000');
    expect(parsed).not.toBeNull();
    expect(parsed!.buckets.system_prompt).toBe(11_200);
    expect(parsed!.buckets.messages).toBe(50_000);
  });

  test('returns null for unparseable input', () => {
    expect(parseContextOutput('')).toBeNull();
    expect(parseContextOutput('no numbers here at all')).toBeNull();
  });

  test('falls back to used + free when no total line present', () => {
    const parsed = parseContextOutput(`
      System prompt:  1,000 tokens
      Messages:      10,000 tokens
      Free space:   189,000 tokens
    `);
    expect(parsed).not.toBeNull();
    expect(parsed!.total_used).toBe(11_000);
    expect(parsed!.total_capacity).toBe(200_000);
  });
});
