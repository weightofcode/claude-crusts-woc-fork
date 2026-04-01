#!/usr/bin/env bun
/**
 * CRUSTS CLI entrypoint.
 *
 * Context window analyzer for Claude Code — breaks down token usage
 * into the 6 CRUSTS categories: Conversation, Retrieved, User,
 * System, Tools, State & Memory.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { discoverSessions } from './scanner.ts';
import { analyzeSession, gatherConfigData } from './analyzer.ts';
import { setVerbose } from './classifier.ts';
import { runCalibration, renderCalibrationComparison } from './calibrator.ts';
import { renderAnalysis, renderTimeline, renderList, renderWaste, renderFix } from './renderer.ts';
import { generateFixPrompts } from './recommender.ts';
import type { SessionInfo } from './types.ts';

const program = new Command();

program
  .name('claude-crusts')
  .description('Break down your Claude Code context window into the 6 CRUSTS categories')
  .version('0.1.0')
  .option('--path <path>', 'Custom path to JSONL session files')
  .option('--json', 'Output as JSON instead of formatted tables')
  .option('--project <name>', 'Filter by project name')
  .option('--verbose', 'Show derivation debug output');

program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.optsWithGlobals();
  if (opts.verbose) setVerbose(true);
});

program
  .command('analyze [session-id]')
  .description('Analyze a specific session or the most recent one')
  .option('--until <n>', 'Analyze only up to message N (1-based)')
  .action(async (sessionId: string | undefined, options: { until?: string }, cmd: Command) => {
    const globals = cmd.optsWithGlobals();
    const session = resolveSession(sessionId, globals.path, globals.project);
    if (!session) return;

    const untilIndex = options.until ? parseInt(options.until, 10) : undefined;
    const result = await analyzeSession(session.path, session.id, session.project, { untilIndex });
    if (!result) {
      console.error(chalk.red('No messages found in session.'));
      return;
    }

    if (globals.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    renderAnalysis(
      result.breakdown,
      result.waste,
      result.recommendations,
      result.sessionId,
      result.project,
      result.messageCount,
    );

    if (result.calibration) {
      renderCalibrationComparison(result.calibration);
    }
  });

program
  .command('list')
  .description('List all available sessions with basic stats')
  .action((_options: unknown, cmd: Command) => {
    const globals = cmd.optsWithGlobals();
    const sessions = discoverSessions(globals.path);

    if (sessions.length === 0) return;

    // Filter by project if specified
    const filtered = globals.project
      ? sessions.filter((s) => s.project.toLowerCase().includes(globals.project.toLowerCase()))
      : sessions;

    if (globals.json) {
      console.log(JSON.stringify(filtered, null, 2));
      return;
    }

    renderList(filtered);

    // Show context file summary
    const configData = gatherConfigData();
    console.log(chalk.bold('  Context sources:'));
    if (configData.systemPrompt.files.length > 0) {
      console.log(`    System prompt files: ${configData.systemPrompt.files.length} (~${configData.systemPrompt.totalEstimatedTokens.toLocaleString()} tokens)`);
    }
    if (configData.mcpServers.length > 0) {
      console.log(`    MCP servers: ${configData.mcpServers.length} (${configData.mcpServers.map((s) => s.name).join(', ')})`);
    }
    if (configData.memoryFiles.files.length > 0) {
      console.log(`    Memory files: ${configData.memoryFiles.files.length} (~${configData.memoryFiles.totalEstimatedTokens.toLocaleString()} tokens)`);
    }
    console.log(`    Built-in tools: ${configData.builtInTools.tools.length} (~${configData.builtInTools.totalEstimatedTokens.toLocaleString()} tokens)`);
    console.log();
  });

program
  .command('timeline [session-id]')
  .description('Show how context grew over the session message by message')
  .option('--until <n>', 'Analyze only up to message N (1-based)')
  .action(async (sessionId: string | undefined, options: { until?: string }, cmd: Command) => {
    const globals = cmd.optsWithGlobals();
    const session = resolveSession(sessionId, globals.path, globals.project);
    if (!session) return;

    const untilIndex = options.until ? parseInt(options.until, 10) : undefined;
    const result = await analyzeSession(session.path, session.id, session.project, { untilIndex });
    if (!result) {
      console.error(chalk.red('No messages found in session.'));
      return;
    }

    if (globals.json) {
      console.log(JSON.stringify(result.breakdown.messages, null, 2));
      return;
    }

    console.log(chalk.bold(`\n  Timeline: ${session.id.slice(0, 8)}`));
    console.log(chalk.dim(`  Messages: ${result.messageCount} | Project: ${session.project}`));

    renderTimeline(result.breakdown.messages, result.breakdown.context_limit, result.breakdown.compactionEvents);
  });

program
  .command('waste [session-id]')
  .description('Focus on waste detection and recommendations')
  .option('--until <n>', 'Analyze only up to message N (1-based)')
  .action(async (sessionId: string | undefined, options: { until?: string }, cmd: Command) => {
    const globals = cmd.optsWithGlobals();
    const session = resolveSession(sessionId, globals.path, globals.project);
    if (!session) return;

    const untilIndex = options.until ? parseInt(options.until, 10) : undefined;
    const result = await analyzeSession(session.path, session.id, session.project, { untilIndex });
    if (!result) {
      console.error(chalk.red('No messages found in session.'));
      return;
    }

    if (globals.json) {
      console.log(JSON.stringify({ waste: result.waste, recommendations: result.recommendations }, null, 2));
      return;
    }

    console.log(chalk.bold(`\n  Waste Detection Report`));
    console.log(chalk.dim(`  Session: ${session.id.slice(0, 8)} | Messages: ${result.messageCount}`));

    renderWaste(result.waste, result.recommendations, result.breakdown.total_tokens);
  });

program
  .command('fix [session-id]')
  .description('Generate pasteable fix prompts for a session')
  .action(async (sessionId: string | undefined, _options: unknown, cmd: Command) => {
    const globals = cmd.optsWithGlobals();
    const session = resolveSession(sessionId, globals.path, globals.project);
    if (!session) return;

    const result = await analyzeSession(session.path, session.id, session.project);
    if (!result) {
      console.error(chalk.red('No messages found in session.'));
      return;
    }

    const fix = generateFixPrompts(result.breakdown, result.waste, result.configData);

    if (globals.json) {
      console.log(JSON.stringify(fix, null, 2));
      return;
    }

    renderFix(fix, result.sessionId);
  });

program
  .command('calibrate')
  .description('Paste /context output for ground truth calibration')
  .action(async () => {
    await runCalibration();
  });

program.parse();

/**
 * Resolve a session by ID prefix or find the latest one.
 * Optionally filter by project name.
 */
function resolveSession(
  sessionId: string | undefined,
  basePath: string | undefined,
  projectFilter: string | undefined,
): SessionInfo | null {
  let sessions = discoverSessions(basePath);
  if (sessions.length === 0) return null;

  if (projectFilter) {
    sessions = sessions.filter((s) =>
      s.project.toLowerCase().includes(projectFilter.toLowerCase()),
    );
    if (sessions.length === 0) {
      console.error(chalk.yellow(`No sessions found for project filter: ${projectFilter}`));
      return null;
    }
  }

  if (!sessionId) return sessions[0] ?? null;

  const match = sessions.find((s) => s.id.startsWith(sessionId));
  if (!match) {
    console.error(chalk.red(`No session found matching: ${sessionId}`));
    return null;
  }
  return match;
}
