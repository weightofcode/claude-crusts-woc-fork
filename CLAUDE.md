# CLAUDE.md — CRUSTS: Context Window Analyzer for Claude Code

## Identity

You are building CRUSTS — a CLI tool that analyzes Claude Code's context window usage by breaking it down into the 6 CRUSTS categories (Conversation, Retrieved, User, System, Tools, State). This is NOT another token counter. This is a context window ANALYZER that tells users WHY their context is filling up and WHAT to do about it.

## Project Context

The Claude Code source was leaked on March 31, 2026 (npm source map exposure). The leaked architecture reveals that session data is stored as JSONL files at `~/.claude/projects/<project>/<session-id>.jsonl`. Each assistant message contains token usage data. The existing `/context` command shows a point-in-time snapshot but provides no analysis, no timeline, no waste detection, and no recommendations.

The tool `ccusage` (11.5K GitHub stars) parses these same JSONL files but only shows cost/usage summaries — it does NOT classify tokens into context window categories.

**CRUSTS fills the gap between "how many tokens am I using?" and "what's eating my context and what should I do about it?"**

## Rules

- TypeScript with Bun runtime (matches Claude Code's own stack)
- Use Zod v4 for schema validation
- CLI interface using Commander.js
- Terminal output using chalk for colors and cli-table3 for tables
- NO React/Ink dependency (keep it lightweight — this is NOT a TUI app)
- All output must work in standard terminals (no special rendering)
- Parse JSONL files line by line (they can be large — stream, don't load all into memory)
- Every function must have JSDoc comments
- Error handling: if JSONL path doesn't exist, show helpful message pointing to Claude Code docs
- MIT license

## Format

- Code style: 2-space indentation, single quotes, semicolons
- File naming: kebab-case (e.g., `claude-crusts-analyzer.ts`, `token-classifier.ts`)
- Exports: named exports, no default exports
- Imports: use path aliases where possible

## Knowledge

### CRUSTS Categories (how to classify tokens)

```
C — Conversation History
    Messages with role "user" or "assistant" that are conversational turns.
    Excludes system messages, tool calls, and tool results.

R — Retrieved Knowledge  
    File read operations (FileReadTool results), web fetch results,
    grep/glob search results. Any content pulled INTO context from
    external sources during the session.

U — User Input
    The current user message (last message with role "user").
    Also includes any file attachments in the current turn.

S — System Instructions
    System prompt content, CLAUDE.md content, memory files loaded
    at session start, output style instructions, appended system
    prompts. Anything with role "system" or injected as system context.

T — Tool Definitions & Results
    Tool schemas (the ~40 built-in tools + MCP tools loaded),
    tool call requests (role "assistant" with tool_use blocks),
    and tool results (role "tool" / tool_result blocks).

S — State & Memory
    Memory directory content (memdir/), extracted memories,
    session state, plan mode content, skill metadata,
    custom agent definitions.
```

### JSONL Structure (from leaked source + community analysis)

Each line in a session JSONL file is a JSON object. Key fields:
- `type`: "human", "assistant", "system", "tool_result", etc.
- `message`: The message content (can be string or array of content blocks)
- `usage`: Token usage object with `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`
- `model`: Which model was used
- `timestamp` or ordering: Messages are in chronological order

### Compaction Thresholds (from leaked source)

- Auto-compaction triggers at ~80% of context window (160K of 200K)
- Emergency compaction at ~95%
- AutoCompact reserves 13,000 token buffer
- Full Compact post-compression budget: 50,000 tokens
- Context quality degrades noticeably above 70%

## Tools

- Bun for runtime and bundling
- Commander.js for CLI argument parsing
- Zod v4 for validation
- chalk for terminal colors
- cli-table3 for table rendering
- No external API calls — everything is local, offline, zero-cost

## Additional Data Sources (beyond JSONL)

### 1. Tool Schema Discovery (for accurate T category)
Instead of a fixed estimate, read actual tool configurations:
- **Built-in tools**: Hardcode the known ~40 tools from the leaked source with per-tool token estimates (~250-350 tokens each)
- **MCP tools**: Read from `~/.claude/settings.json` (global) and `<project>/.mcp.json` (project-level) to discover connected MCP servers and their tool counts
- **Actual usage**: Scan JSONL for `tool_use` blocks to determine which tools were INVOKED vs merely LOADED. `loaded - invoked = wasted schemas`

### 2. System Prompt Size (for accurate S category)
Read the actual files instead of estimating:
- `~/.claude/CLAUDE.md` (user-level)
- `<project>/CLAUDE.md` (project-level)
- `<project>/.claude/settings.json` (additional config)
- `~/.claude/memdir/` files (persistent memory)
- Calculate exact token count from file content using char/4

### 3. /context Calibration (ground truth)
The native `/context` command shows exact token totals. Support a calibration flow:
- `claude-crusts calibrate` — prompts user to paste /context output
- Parse the /context output to extract exact per-bucket totals
- Compare against JSONL-based estimates and show delta
- Use /context totals as ground truth, JSONL analysis for the per-message detail breakdown

### 4. Claude Code Hook Integration (Phase 2)
Claude Code supports lifecycle hooks (PreToolUse, PostToolUse, SessionStart, SessionEnd).
A future hook could automatically capture /context snapshots and feed them to CRUSTS for real-time calibrated analysis.

## Project Structure

```
claude-crusts/
├── src/
│   ├── index.ts              # CLI entrypoint (Commander.js)
│   ├── analyzer.ts           # Main analysis orchestrator
│   ├── classifier.ts         # CRUSTS category classifier
│   ├── scanner.ts            # JSONL file + config file discovery and parsing
│   ├── calibrator.ts         # /context output parser for ground truth calibration
│   ├── token-estimator.ts    # Token estimation for content blocks
│   ├── waste-detector.ts     # Waste and inefficiency detection
│   ├── recommender.ts        # Smart recommendations engine
│   ├── renderer.ts           # Terminal output formatting
│   ├── built-in-tools.ts     # Hardcoded list of ~40 built-in tools with schema sizes
│   └── types.ts              # Shared type definitions
├── package.json
├── tsconfig.json
├── CLAUDE.md                 # This file
├── README.md                 # GitHub-ready README
└── LICENSE                   # MIT
```
