# CRUSTS Roadmap

## Completed

- **v0.1.0** — Core analysis engine: 6-category CRUSTS breakdown, duplicate/unused tool detection, compaction detection, 7 recommendation patterns, session forensics, calibration, timeline view
- **v0.2.0** — Distribution & comparison: npm publish pipeline, cross-session comparison, HTML report generation, edit-aware waste detection, model/duration extraction
- **v0.3.0** — Live monitoring & recovery: watch mode with compact dashboard, compaction loss analysis, Markdown report format, `/crusts` slash command, content-based compact focus hints

## v0.1.0
- [x] CRUSTS 6-category context breakdown (99.4% accuracy)
- [x] Duplicate file detection with exact counts
- [x] Unused tool detection (loaded vs invoked)
- [x] Compaction detection with marker-based boundaries
- [x] 7 actionable recommendation patterns
- [x] Past session forensics
- [x] /context calibration
- [x] Session timeline view

## v0.2.0
- [x] npm publish pipeline (`npx claude-crusts analyze` works)
- [x] Cross-session comparison (`claude-crusts compare session1 session2`)
- [x] Standalone HTML/Markdown report generation (`claude-crusts report`)
- [x] Edit-aware waste detection (Write/Edit between reads = valid)
- [x] Model name and session duration extraction from JSONL

## v0.3.0
- [x] Watch mode — live dashboard as session JSONL grows (`claude-crusts watch`)
- [x] "What was lost in compaction" detail view (`claude-crusts lost`)
- [x] Markdown report format (`--format md`)
- [x] Custom slash command (`/crusts` via `.claude/commands/crusts.md`)
- [x] Content-based `/compact focus` hints (file names + task context instead of message numbers)

## v0.4.0 (planned)
- [ ] Interactive TUI mode — full-screen terminal interface with tabs for analyze, watch, waste, lost, and timeline. Keyboard navigation to switch between views without running separate commands. Think htop for context windows.
- [ ] Trend analysis across sessions ("your last 5 sessions averaged...")
- [ ] Improved memory file detection
- [ ] Skills discovery from config
- [ ] Claude Code hook integration (auto-run after compaction)
- [ ] Statusline integration
