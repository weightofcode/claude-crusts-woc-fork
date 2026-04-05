/**
 * Session comparison engine.
 *
 * Takes two AnalysisResult objects and produces a structured
 * comparison with per-category deltas, waste/compaction diffs,
 * and auto-generated insight strings.
 */

import type {
  AnalysisResult,
  CrustsCategory,
  CategoryDelta,
  ComparisonResult,
} from './types.ts';

/** All 6 CRUSTS categories in display order */
const CATEGORIES: CrustsCategory[] = [
  'conversation', 'retrieved', 'user', 'system', 'tools', 'state',
];

/**
 * Compare two session analysis results.
 *
 * Produces per-category deltas, waste/compaction comparison,
 * and 3-5 auto-generated insight strings based on threshold rules.
 *
 * @param a - First session analysis result
 * @param b - Second session analysis result
 * @returns Structured comparison result
 */
export function compareSessions(a: AnalysisResult, b: AnalysisResult): ComparisonResult {
  const totalA = a.breakdown.total_tokens;
  const totalB = b.breakdown.total_tokens;
  const totalDelta = totalB - totalA;
  const totalDeltaPercent = totalA > 0 ? (totalDelta / totalA) * 100 : 0;

  // Per-category deltas
  const categoryDeltas: CategoryDelta[] = CATEGORIES.map((cat) => {
    const bucketA = a.breakdown.buckets.find((b) => b.category === cat);
    const bucketB = b.breakdown.buckets.find((b) => b.category === cat);
    const tokensA = bucketA?.tokens ?? 0;
    const tokensB = bucketB?.tokens ?? 0;
    const delta = tokensB - tokensA;
    const deltaPercent = tokensA > 0 ? (delta / tokensA) * 100 : (tokensB > 0 ? 100 : 0);
    return { category: cat, tokensA, tokensB, delta, deltaPercent };
  });

  // Waste comparison
  const wasteTokensA = a.waste.reduce((sum, w) => sum + w.estimated_tokens, 0);
  const wasteTokensB = b.waste.reduce((sum, w) => sum + w.estimated_tokens, 0);

  // Compaction comparison
  const compCountA = a.breakdown.compactionEvents.length;
  const compCountB = b.breakdown.compactionEvents.length;

  // Generate insights
  const insights = generateInsights(a, b, categoryDeltas, totalA, totalB);

  return {
    sessionA: { id: a.sessionId, project: a.project, messageCount: a.messageCount },
    sessionB: { id: b.sessionId, project: b.project, messageCount: b.messageCount },
    totalA,
    totalB,
    totalDelta,
    totalDeltaPercent,
    categoryDeltas,
    waste: {
      countA: a.waste.length,
      countB: b.waste.length,
      totalTokensA: wasteTokensA,
      totalTokensB: wasteTokensB,
    },
    compaction: { countA: compCountA, countB: compCountB },
    insights,
  };
}

/**
 * Generate 3-5 insight strings based on comparison threshold rules.
 *
 * Rules:
 * 1. Tool overhead: if tools category differs by >15%
 * 2. Conversation growth: if conversation category differs by >10%
 * 3. Waste ratio: if one session has 2x+ the waste count of the other
 * 4. Compaction difference: if one session had compaction and the other didn't
 * 5. Overall usage: if total token difference exceeds 20%
 *
 * @param a - First session
 * @param b - Second session
 * @param deltas - Per-category deltas
 * @param totalA - Total tokens for session A
 * @param totalB - Total tokens for session B
 * @returns Array of insight strings
 */
function generateInsights(
  a: AnalysisResult,
  b: AnalysisResult,
  deltas: CategoryDelta[],
  totalA: number,
  totalB: number,
): string[] {
  const insights: string[] = [];

  // Rule 1: Tool overhead >15% difference
  const toolDelta = deltas.find((d) => d.category === 'tools');
  if (toolDelta && Math.abs(toolDelta.deltaPercent) > 15) {
    const higher = toolDelta.delta > 0 ? 'B' : 'A';
    const diff = Math.abs(toolDelta.delta).toLocaleString();
    insights.push(`Session ${higher} uses ${diff} more tokens on tool schemas/results — check for unused MCP servers or redundant tool calls.`);
  }

  // Rule 2: Conversation growth >10% difference
  const convDelta = deltas.find((d) => d.category === 'conversation');
  if (convDelta && Math.abs(convDelta.deltaPercent) > 10) {
    const higher = convDelta.delta > 0 ? 'B' : 'A';
    const diff = Math.abs(convDelta.delta).toLocaleString();
    insights.push(`Session ${higher} has ${diff} more conversation tokens — longer exchanges fill context faster.`);
  }

  // Rule 3: Waste count 2x ratio
  const wasteA = a.waste.length;
  const wasteB = b.waste.length;
  if (wasteA > 0 && wasteB > 0) {
    if (wasteB >= wasteA * 2) {
      insights.push(`Session B has ${wasteB} waste items vs ${wasteA} in A — it may benefit from more targeted file reads.`);
    } else if (wasteA >= wasteB * 2) {
      insights.push(`Session A has ${wasteA} waste items vs ${wasteB} in B — it may benefit from more targeted file reads.`);
    }
  } else if (wasteA === 0 && wasteB > 0) {
    insights.push(`Session A has no detected waste while B has ${wasteB} issue(s).`);
  } else if (wasteB === 0 && wasteA > 0) {
    insights.push(`Session B has no detected waste while A has ${wasteA} issue(s).`);
  }

  // Rule 4: Compaction difference
  const compA = a.breakdown.compactionEvents.length;
  const compB = b.breakdown.compactionEvents.length;
  if (compA > 0 && compB === 0) {
    insights.push(`Session A hit compaction (${compA}x) but B did not — A likely had a longer or heavier exchange.`);
  } else if (compB > 0 && compA === 0) {
    insights.push(`Session B hit compaction (${compB}x) but A did not — B likely had a longer or heavier exchange.`);
  } else if (compA > 0 && compB > 0 && compA !== compB) {
    insights.push(`Both sessions compacted: A ${compA}x vs B ${compB}x.`);
  }

  // Rule 5: Overall usage >20% difference
  const overallDeltaPct = totalA > 0 ? Math.abs(totalB - totalA) / totalA * 100 : 0;
  if (overallDeltaPct > 20) {
    const higher = totalB > totalA ? 'B' : 'A';
    const diff = Math.abs(totalB - totalA).toLocaleString();
    insights.push(`Session ${higher} used ${diff} more total tokens (${overallDeltaPct.toFixed(0)}% difference) — context efficiency varies significantly.`);
  }

  return insights;
}
