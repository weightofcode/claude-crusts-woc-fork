/**
 * Hardcoded list of Claude Code's ~40 built-in tools with schema sizes.
 *
 * Token estimates calibrated against /context ground truth (~9,100 total).
 * Average ~228 tokens per tool schema.
 */

/** Built-in tool definition with estimated schema token cost */
export interface BuiltInTool {
  name: string;
  estimated_tokens: number;
}

/** Known built-in tools from Claude Code */
export const BUILT_IN_TOOLS: BuiltInTool[] = [
  { name: 'Read', estimated_tokens: 250 },
  { name: 'Write', estimated_tokens: 280 },
  { name: 'Edit', estimated_tokens: 280 },
  { name: 'Bash', estimated_tokens: 250 },
  { name: 'Glob', estimated_tokens: 200 },
  { name: 'Grep', estimated_tokens: 250 },
  { name: 'WebFetch', estimated_tokens: 250 },
  { name: 'WebSearch', estimated_tokens: 230 },
  { name: 'Agent', estimated_tokens: 280 },
  { name: 'TodoRead', estimated_tokens: 200 },
  { name: 'TodoWrite', estimated_tokens: 230 },
  { name: 'NotebookEdit', estimated_tokens: 250 },
  { name: 'AskUserQuestion', estimated_tokens: 200 },
  { name: 'Skill', estimated_tokens: 230 },
  { name: 'TaskCreate', estimated_tokens: 230 },
  { name: 'TaskUpdate', estimated_tokens: 230 },
  { name: 'TaskGet', estimated_tokens: 200 },
  { name: 'TaskList', estimated_tokens: 200 },
  { name: 'TaskOutput', estimated_tokens: 200 },
  { name: 'TaskStop', estimated_tokens: 200 },
  { name: 'EnterPlanMode', estimated_tokens: 200 },
  { name: 'ExitPlanMode', estimated_tokens: 200 },
  { name: 'EnterWorktree', estimated_tokens: 230 },
  { name: 'ExitWorktree', estimated_tokens: 200 },
  { name: 'CronCreate', estimated_tokens: 250 },
  { name: 'CronDelete', estimated_tokens: 200 },
  { name: 'CronList', estimated_tokens: 200 },
  { name: 'RemoteTrigger', estimated_tokens: 230 },
  { name: 'ToolSearch', estimated_tokens: 230 },
  { name: 'Tool_30', estimated_tokens: 225 },
  { name: 'Tool_31', estimated_tokens: 225 },
  { name: 'Tool_32', estimated_tokens: 225 },
  { name: 'Tool_33', estimated_tokens: 225 },
  { name: 'Tool_34', estimated_tokens: 225 },
  { name: 'Tool_35', estimated_tokens: 225 },
  { name: 'Tool_36', estimated_tokens: 225 },
  { name: 'Tool_37', estimated_tokens: 225 },
  { name: 'Tool_38', estimated_tokens: 225 },
  { name: 'Tool_39', estimated_tokens: 225 },
  { name: 'Tool_40', estimated_tokens: 225 },
];

/** Total estimated tokens for all built-in tool schemas */
export const TOTAL_BUILTIN_TOOL_TOKENS = BUILT_IN_TOOLS.reduce(
  (sum, tool) => sum + tool.estimated_tokens,
  0,
);
