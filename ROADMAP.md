# CRUSTS Roadmap

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
- [x] Standalone HTML report generation (`claude-crusts report`)
- [x] Edit-aware waste detection (Write/Edit between reads = valid)
- [x] Model name and session duration extraction from JSONL

## v0.3.0 (planned)
- [ ] Trend analysis across sessions ("your last 5 sessions averaged...")
- [ ] Improved memory file detection
- [ ] Skills discovery from config
- [ ] Watch mode — live updates as session JSONL grows
- [ ] "What was lost in compaction" detail view

## v0.4.0 (future)
- [ ] Claude Code hook integration (auto-run after compaction)
- [ ] Statusline integration
- [ ] Custom slash command template
