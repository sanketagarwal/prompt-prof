# prompt-prof

Analyze prompt effectiveness for AI coding assistants. Track quality scores, costs, patterns, and get actionable insights to improve your prompting.

**Supports:** Claude Code & Cursor

## Installation

```bash
npm install -g prompt-prof
```

## Quick Start

```bash
# View stats for all AI assistants
prompt-prof stats

# Claude Code analysis
prompt-prof claude report daily
prompt-prof claude patterns best

# Cursor analysis
prompt-prof cursor report summary
prompt-prof cursor patterns worst
```

## Features

- **Quality Scoring** - Rate prompts on clarity, context, efficiency, and outcome (0-100)
- **Pattern Detection** - Identify retries, vague commands, and improvement opportunities
- **Cost Analysis** - Track spending by model, detect wasted spend (Claude Code)
- **Tool Usage Stats** - See which tools are used most and their success rates
- **Best/Worst Prompts** - Learn from your most and least effective prompts

## Commands

### Claude Code

```bash
# Reports
prompt-prof claude report daily              # Today's summary
prompt-prof claude report daily -d 2026-01-22  # Specific date
prompt-prof claude report weekly             # Past 7 days

# Prompt Patterns
prompt-prof claude patterns best             # Top 10 prompts by quality
prompt-prof claude patterns best -n 20       # Top 20 prompts
prompt-prof claude patterns worst            # Bottom 10 prompts
prompt-prof claude patterns worst -d 30      # Look back 30 days

# Cost Analysis
prompt-prof claude cost summary              # Cost breakdown
prompt-prof claude cost summary -d 30        # Past 30 days

# Sessions
prompt-prof claude list sessions             # Recent sessions
prompt-prof claude list sessions -n 20       # Show 20 sessions
prompt-prof claude analyze <sessionId>       # Analyze specific session
```

### Cursor

```bash
# Reports
prompt-prof cursor report summary            # Usage summary (past 7 days)
prompt-prof cursor report summary -d 30      # Past 30 days

# Prompt Patterns
prompt-prof cursor patterns best             # Top 10 prompts
prompt-prof cursor patterns worst            # Bottom 10 prompts

# Transcripts
prompt-prof cursor list transcripts          # Recent transcripts
prompt-prof cursor analyze <transcriptId>    # Analyze specific transcript

# Database Stats
prompt-prof cursor stats                     # Code generations, models, file types
```

### Global

```bash
prompt-prof stats                            # Combined stats for all sources
prompt-prof --help                           # Help
```

## Quality Scoring

Prompts are scored on 4 dimensions (0-100 each, weighted equally):

### Clarity (25%)
- **+10** File/function references
- **+8** Clear action verbs (create, fix, update)
- **+5** Line numbers, error messages, code snippets
- **-15** Vague commands ("fix it", "make it work")
- **-10** Short prompts without context

### Context (25%)
- **+10** Proper follow-up references
- **+8** References recent tool output
- **-15** Cold start with unclear reference
- **-10** Assumes missing context

### Efficiency (25%)
- **-20** Retry of previous prompt (similarity > 60%)
- **-10** Excessive verbosity (500+ words)

### Outcome (25%)
- Based on tool success rate
- **-15** Required clarification follow-up
- **-20** Conversation loop detected

## Example Output

```
╔════════════════════════════════════════════════════╗
║         Daily Report: January 22, 2026             ║
╠════════════════════════════════════════════════════╣
║ Sessions: 4    Prompts: 47    Cost: $2.47          ║
╠════════════════════════════════════════════════════╣

📊 METRICS
┌──────────────────┬─────────┬─────────┐
│ Metric           │ Value   │ Status  │
├──────────────────┼─────────┼─────────┤
│ Avg Quality      │ 72/100  │ ↑ Good  │
│ Cache Hit Rate   │ 89.2%   │ ✓       │
│ Retry Rate       │ 8.5%    │ ✓       │
│ Tool Success     │ 94.3%   │ ✓       │
└──────────────────┴─────────┴─────────┘

🏆 TOP PROMPTS
1. "Create REST API endpoint for..." (Score: 94)
2. "Fix TypeScript error in auth.ts:42" (Score: 91)

⚠️ NEEDS IMPROVEMENT
1. "fix it" (Score: 12) - Too vague
2. "do the same thing again" (Score: 18) - Missing context
```

## Data Sources

### Claude Code
- `~/.claude/projects/[path]/[sessionId].jsonl` - Session conversations
- `~/.claude/stats-cache.json` - Aggregated statistics

### Cursor
- `~/.cursor/projects/[project]/agent-transcripts/*.txt` - Agent conversations
- `~/.cursor/ai-tracking/ai-code-tracking.db` - SQLite database with code generation stats

## Programmatic Usage

```typescript
import {
  parseSessions,
  analyzeSessionPrompts,
  calculateAverageQuality,
  parseCursorTranscripts,
  analyzeCursorTranscriptPrompts,
} from 'prompt-prof';

// Analyze Claude Code sessions
const sessions = await parseSessions(startDate, endDate);
for (const session of sessions) {
  const analyzed = analyzeSessionPrompts(session);
  console.log(`Avg quality: ${calculateAverageQuality(analyzed)}`);
}

// Analyze Cursor transcripts
const transcripts = parseCursorTranscripts(startDate, endDate);
for (const transcript of transcripts) {
  const analyzed = analyzeCursorTranscriptPrompts(transcript);
  // ...
}
```

## Tips for Better Prompts

Based on the scoring system, here are ways to improve your prompts:

1. **Be specific** - Include file names, function names, line numbers
2. **Use action verbs** - "Create", "Fix", "Update", "Refactor" instead of "do" or "change"
3. **Provide context** - Include error messages, code snippets, or expected behavior
4. **Avoid vague language** - "Fix it" or "Make it work" score poorly
5. **Reference previous context** - "In the file we just edited" is clearer than "that file"
6. **Don't repeat yourself** - Retries are detected and penalized

## License

MIT
