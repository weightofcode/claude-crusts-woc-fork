/**
 * Lost content detector.
 *
 * Reconstructs what existed before each compaction event and what
 * survived in the compaction summary, then reports what was lost.
 * Groups lost content into: file reads, conversations, tool results,
 * and instructions.
 */

import type {
  SessionMessage,
  ClassifiedMessage,
  CompactionEvent,
  CrustsCategory,
} from './types.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single item lost during compaction */
export interface LostItem {
  type: 'file_read' | 'conversation' | 'tool_result' | 'instruction';
  description: string;
  tokens: number;
  messageRange: [number, number];
}

/** Analysis of a single compaction event */
export interface CompactionLoss {
  /** Which compaction event (1-based) */
  eventNumber: number;
  /** Message index of the compaction boundary */
  boundaryIndex: number;
  /** Tokens in context before compaction */
  tokensBefore: number;
  /** Tokens after compaction */
  tokensAfter: number;
  /** Tokens dropped */
  tokensDropped: number;
  /** Summary text from the compaction (if found) */
  summaryExcerpt: string | null;
  /** Items determined to be lost */
  lostItems: LostItem[];
  /** Total tokens across all lost items */
  totalLostTokens: number;
}

/** Full lost analysis result */
export interface LostAnalysis {
  sessionId: string;
  project: string;
  compactionCount: number;
  events: CompactionLoss[];
  /** Grand total tokens lost across all compactions */
  grandTotalLost: number;
  /** Grand total pre-compaction tokens across all events */
  grandTotalBefore: number;
}

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

/**
 * Analyze what was lost during each compaction event in a session.
 *
 * For each compaction: reconstructs the BEFORE window (session start or
 * previous compaction through the boundary), extracts the AFTER summary
 * text, then identifies content from BEFORE that isn't represented in
 * the summary using filename/identifier matching.
 *
 * @param messages - All parsed session messages
 * @param classified - All classified messages from the classifier
 * @param compactionEvents - Detected compaction events
 * @param sessionId - Session ID for the result
 * @param project - Project name for the result
 * @returns Full lost analysis, or null if no compaction events
 */
export function analyzeLostContent(
  messages: SessionMessage[],
  classified: ClassifiedMessage[],
  compactionEvents: CompactionEvent[],
  sessionId: string,
  project: string,
): LostAnalysis | null {
  if (compactionEvents.length === 0) return null;

  const events: CompactionLoss[] = [];
  let grandTotalLost = 0;
  let grandTotalBefore = 0;

  for (let ei = 0; ei < compactionEvents.length; ei++) {
    const event = compactionEvents[ei]!;

    // Determine the start of the BEFORE window
    const windowStart = ei === 0
      ? 0
      : compactionEvents[ei - 1]!.afterIndex;

    // BEFORE: messages from windowStart to the boundary
    const beforeMessages = classified.filter(
      (m) => m.index >= windowStart && m.index < event.beforeIndex,
    );

    // Extract the compaction summary text
    const summaryText = extractSummaryText(messages, event);

    // Find lost items by comparing BEFORE content against summary
    const lostItems = findLostItems(messages, beforeMessages, summaryText);

    const totalLostTokens = lostItems.reduce((sum, item) => sum + item.tokens, 0);
    grandTotalLost += totalLostTokens;
    grandTotalBefore += event.tokensBefore;

    events.push({
      eventNumber: ei + 1,
      boundaryIndex: event.beforeIndex,
      tokensBefore: event.tokensBefore,
      tokensAfter: event.tokensAfter,
      tokensDropped: event.tokensDropped,
      summaryExcerpt: summaryText ? summaryText.slice(0, 200) : null,
      lostItems,
      totalLostTokens,
    });
  }

  return {
    sessionId,
    project,
    compactionCount: compactionEvents.length,
    events,
    grandTotalLost,
    grandTotalBefore,
  };
}

// ---------------------------------------------------------------------------
// Summary extraction
// ---------------------------------------------------------------------------

/**
 * Extract the full text content of a compaction summary message.
 *
 * @param messages - All session messages
 * @param event - The compaction event
 * @returns Summary text, or null if no summary found
 */
function extractSummaryText(messages: SessionMessage[], event: CompactionEvent): string | null {
  if (event.summaryIndex === undefined) return null;

  const summaryMsg = messages[event.summaryIndex];
  if (!summaryMsg) return null;

  return extractMessageText(summaryMsg);
}

/**
 * Extract all text content from a single message.
 *
 * @param msg - Session message
 * @returns Concatenated text content
 */
function extractMessageText(msg: SessionMessage): string {
  const content = msg.message?.content;
  if (!content) return '';
  if (typeof content === 'string') return content;

  const parts: string[] = [];
  for (const block of content) {
    if (block.text) parts.push(block.text);
    if (block.thinking) parts.push(block.thinking);
    if (typeof block.content === 'string') parts.push(block.content);
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Lost item detection
// ---------------------------------------------------------------------------

/**
 * Find items from the BEFORE window that aren't represented in the summary.
 *
 * Groups messages into logical items (file reads, conversations, tool results,
 * instructions) and checks each against the summary text for representation.
 *
 * @param messages - All session messages
 * @param beforeClassified - Classified messages from the BEFORE window
 * @param summaryText - The compaction summary text (or null)
 * @returns Array of lost items
 */
function findLostItems(
  messages: SessionMessage[],
  beforeClassified: ClassifiedMessage[],
  summaryText: string | null,
): LostItem[] {
  const lost: LostItem[] = [];
  const summary = (summaryText ?? '').toLowerCase();

  // 1. Lost file reads
  const fileReads = extractFileReadsFromWindow(messages, beforeClassified);
  for (const read of fileReads) {
    const filename = extractFilename(read.filePath);
    const preserved = summary.includes(filename.toLowerCase());
    if (!preserved) {
      lost.push({
        type: 'file_read',
        description: `File read: ${filename}`,
        tokens: read.tokens,
        messageRange: [read.messageIndex, read.messageIndex + 1],
      });
    }
  }

  // 2. Lost conversations (user text + assistant response pairs)
  const conversations = extractConversationsFromWindow(messages, beforeClassified);
  for (const conv of conversations) {
    // Check if key terms from the conversation appear in summary
    const terms = extractKeyTerms(conv.text);
    const preserved = terms.length > 0 && terms.some((t) => summary.includes(t.toLowerCase()));
    if (!preserved) {
      lost.push({
        type: 'conversation',
        description: `Exchange: "${conv.preview}"`,
        tokens: conv.tokens,
        messageRange: [conv.startIndex, conv.endIndex],
      });
    }
  }

  // 3. Lost tool results (non-retrieval)
  const toolResults = extractToolResultsFromWindow(messages, beforeClassified);
  for (const tr of toolResults) {
    const preserved = tr.toolName
      ? summary.includes(tr.toolName.toLowerCase())
        || (tr.preview.length > 20 && summary.includes(tr.preview.slice(0, 30).toLowerCase()))
      : false;
    if (!preserved) {
      const toolLabel = tr.toolName ?? 'Tool';
      const desc = tr.preview
        ? `${toolLabel} result: ${tr.preview}`
        : `${toolLabel} sub-task result`;
      lost.push({
        type: 'tool_result',
        description: desc,
        tokens: tr.tokens,
        messageRange: [tr.messageIndex, tr.messageIndex],
      });
    }
  }

  // 4. Lost instructions (system/state messages)
  const instructions = extractInstructionsFromWindow(messages, beforeClassified);
  for (const inst of instructions) {
    const terms = extractKeyTerms(inst.text);
    const preserved = terms.length > 0 && terms.some((t) => summary.includes(t.toLowerCase()));
    if (!preserved) {
      lost.push({
        type: 'instruction',
        description: `Instruction: "${inst.preview}"`,
        tokens: inst.tokens,
        messageRange: [inst.messageIndex, inst.messageIndex],
      });
    }
  }

  // Sort by tokens descending
  lost.sort((a, b) => b.tokens - a.tokens);

  return lost;
}

// ---------------------------------------------------------------------------
// Content extractors
// ---------------------------------------------------------------------------

/** A file read found in the BEFORE window */
interface WindowFileRead {
  filePath: string;
  messageIndex: number;
  tokens: number;
}

/**
 * Extract file read operations from the BEFORE window.
 *
 * @param messages - All session messages
 * @param beforeClassified - Classified messages in the window
 * @returns Array of file reads with paths and token costs
 */
function extractFileReadsFromWindow(
  messages: SessionMessage[],
  beforeClassified: ClassifiedMessage[],
): WindowFileRead[] {
  const reads: WindowFileRead[] = [];
  const seenFiles = new Set<string>();

  for (const cm of beforeClassified) {
    const msg = messages[cm.index];
    if (!msg || !Array.isArray(msg.message?.content)) continue;

    for (const block of msg.message.content) {
      if (block.type !== 'tool_use') continue;
      if (block.name !== 'Read' && block.name !== 'FileReadTool') continue;

      let filePath = (block.input?.file_path as string | undefined)
        ?? (block.input?.path as string | undefined);
      if (!filePath) continue;

      // If the file path looks like a tool_use ID (temp agent result file),
      // try to extract a real path from the tool_result content instead
      const filename = extractFilename(filePath);
      const bareFilename = filename.replace(/\.\w+$/, '');
      if (isToolUseId(bareFilename)) {
        filePath = 'Agent sub-task result';
      }

      const normalized = filePath.replace(/\\/g, '/').toLowerCase();
      if (seenFiles.has(normalized)) continue;
      seenFiles.add(normalized);

      // Token cost is on the next message (tool_result)
      const nextCm = beforeClassified.find((c) => c.index === cm.index + 1);
      const tokens = nextCm ? nextCm.tokens : 0;

      reads.push({ filePath, messageIndex: cm.index, tokens });
    }
  }

  return reads;
}

/** A conversation exchange from the BEFORE window */
interface WindowConversation {
  text: string;
  preview: string;
  tokens: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Extract user/assistant conversation exchanges from the BEFORE window.
 *
 * Groups consecutive user text + assistant response into exchanges.
 * Skips tool-only messages and system messages.
 *
 * @param messages - All session messages
 * @param beforeClassified - Classified messages in the window
 * @returns Array of conversation exchanges
 */
function extractConversationsFromWindow(
  messages: SessionMessage[],
  beforeClassified: ClassifiedMessage[],
): WindowConversation[] {
  const conversations: WindowConversation[] = [];

  for (let i = 0; i < beforeClassified.length; i++) {
    const cm = beforeClassified[i]!;
    if (cm.category !== 'conversation') continue;

    const msg = messages[cm.index];
    if (!msg) continue;

    // Only user text messages that start an exchange
    if (msg.type !== 'user') continue;
    const hasToolResult = Array.isArray(msg.message?.content)
      && msg.message.content.some((b) => b.type === 'tool_result');
    if (hasToolResult) continue;

    const userText = extractMessageText(msg);
    if (userText.length < 10) continue;

    // Look for the next assistant response
    let tokens = cm.tokens;
    let endIndex = cm.index;
    let responseText = '';
    const next = beforeClassified[i + 1];
    if (next && next.category === 'conversation' && messages[next.index]?.type === 'assistant') {
      tokens += next.tokens;
      endIndex = next.index;
      responseText = extractMessageText(messages[next.index]!);
    }

    if (tokens < 50) continue;

    const preview = userText.slice(0, 80).replace(/\n/g, ' ');
    conversations.push({
      text: userText + ' ' + responseText,
      preview,
      tokens,
      startIndex: cm.index,
      endIndex,
    });
  }

  return conversations;
}

/** A tool result from the BEFORE window */
interface WindowToolResult {
  toolName: string | undefined;
  preview: string;
  tokens: number;
  messageIndex: number;
}

/**
 * Extract non-retrieval tool results from the BEFORE window.
 *
 * File reads are handled separately, so this captures Bash output,
 * Grep results, and other tool outputs.
 *
 * @param messages - All session messages
 * @param beforeClassified - Classified messages in the window
 * @returns Array of tool results
 */
function extractToolResultsFromWindow(
  messages: SessionMessage[],
  beforeClassified: ClassifiedMessage[],
): WindowToolResult[] {
  const results: WindowToolResult[] = [];

  for (const cm of beforeClassified) {
    if (cm.category !== 'tools') continue;

    const msg = messages[cm.index];
    if (!msg || msg.type !== 'user') continue;
    if (!Array.isArray(msg.message?.content)) continue;

    const hasToolResult = msg.message.content.some((b) => b.type === 'tool_result');
    if (!hasToolResult) continue;

    if (cm.tokens < 50) continue;

    let text = extractMessageText(msg);
    // For tool_result blocks, also try extracting content from the result itself
    if (!text.trim()) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_result' && typeof block.content === 'string' && block.content.trim()) {
          text = block.content;
          break;
        }
        if (block.type === 'tool_result' && Array.isArray(block.content)) {
          for (const sub of block.content) {
            if (sub.text?.trim()) {
              text = sub.text;
              break;
            }
          }
          if (text.trim()) break;
        }
      }
    }
    const preview = text.trim() ? text.slice(0, 80).replace(/\n/g, ' ').trim() : '';

    results.push({
      toolName: cm.toolName,
      preview,
      tokens: cm.tokens,
      messageIndex: cm.index,
    });
  }

  return results;
}

/** An instruction from the BEFORE window */
interface WindowInstruction {
  text: string;
  preview: string;
  tokens: number;
  messageIndex: number;
}

/**
 * Extract system/state instruction messages from the BEFORE window.
 *
 * @param messages - All session messages
 * @param beforeClassified - Classified messages in the window
 * @returns Array of instruction items
 */
function extractInstructionsFromWindow(
  messages: SessionMessage[],
  beforeClassified: ClassifiedMessage[],
): WindowInstruction[] {
  const instructions: WindowInstruction[] = [];

  for (const cm of beforeClassified) {
    if (cm.category !== 'system' && cm.category !== 'state') continue;

    const msg = messages[cm.index];
    if (!msg) continue;
    if (cm.tokens < 20) continue;

    // Skip compact_boundary and meta messages
    if (msg.subtype === 'compact_boundary' || msg.isMeta) continue;

    const text = extractMessageText(msg);
    if (text.length < 10) continue;

    const preview = text.slice(0, 80).replace(/\n/g, ' ');
    instructions.push({
      text,
      preview,
      tokens: cm.tokens,
      messageIndex: cm.index,
    });
  }

  return instructions;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect whether a string looks like a tool_use ID rather than a real filename.
 *
 * @param name - Filename candidate
 * @returns True if it matches tool ID patterns
 */
function isToolUseId(name: string): boolean {
  return /^toolu_[a-zA-Z0-9]+(\.\w+)?$/.test(name);
}

/**
 * Extract the filename portion from a full path.
 *
 * @param filePath - Full file path
 * @returns Just the filename
 */
function extractFilename(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? filePath;
}

/**
 * Extract key terms from text for fuzzy matching against the summary.
 *
 * Pulls out filenames, function-like identifiers, and significant words.
 *
 * @param text - Source text
 * @returns Array of key terms (lowercase)
 */
function extractKeyTerms(text: string): string[] {
  const terms: string[] = [];

  // File-like patterns: word.ext
  const fileMatches = text.match(/[\w-]+\.\w{1,6}/g);
  if (fileMatches) {
    for (const m of fileMatches) {
      terms.push(m);
    }
  }

  // Function-like patterns: wordWord or word_word followed by (
  const funcMatches = text.match(/[a-zA-Z_]\w{3,}\s*\(/g);
  if (funcMatches) {
    for (const m of funcMatches) {
      terms.push(m.replace(/\s*\($/, ''));
    }
  }

  // Significant words (>6 chars, not common)
  const words = text.split(/\s+/);
  for (const w of words) {
    const clean = w.replace(/[^a-zA-Z]/g, '');
    if (clean.length > 6) {
      terms.push(clean);
    }
  }

  return terms.slice(0, 20);
}
