# prompt-prof

**Analyze your AI coding assistant prompts to become a better prompter.**

Track prompt quality, identify patterns, and get actionable insights to improve your effectiveness with Claude Code and Cursor.

## Why prompt-prof?

AI coding assistants are powerful, but their effectiveness depends heavily on how you prompt them. This tool helps you:

- **Understand your prompting patterns** - See what types of prompts you use most
- **Identify inefficiencies** - Find vague prompts, excessive retries, and clarifications
- **Track quality over time** - Monitor your average prompt scores
- **Learn from your best prompts** - See what works and replicate it

## Supported AI Assistants

| Assistant | Data Location | What's Analyzed |
|-----------|---------------|-----------------|
| **Claude Code** | `~/.claude/` | Sessions, costs, tokens, tool usage |
| **Cursor** | `~/.cursor/` | Agent transcripts, code generations |

## Installation

```bash
npm install -g prompt-prof
```

## Quick Start

```bash
# Comprehensive report for all AI assistants
prompt-prof report

# Today only
prompt-prof report -d 1

# Past 30 days
prompt-prof report -d 30
```

## Example Output

```
╔════════════════════════════════════════════════════╗
║    Prompt Effectiveness Report (Past 7 days)     ║
╚════════════════════════════════════════════════════╝

🤖 CLAUDE CODE

┌───────────────┬────────┐
│ Total Prompts │ 76     │
│ Average Score │ 59/100 │
│ Sessions      │ 10     │
└───────────────┴────────┘

Prompt Types:
┌──────────────────┬───────┬───────┐
│ Type             │ Count │ %     │
├──────────────────┼───────┼───────┤
│ Code Generation  │ 4     │ 5.3%  │
│ Questions        │ 21    │ 27.6% │
│ Commands/Actions │ 16    │ 21.1% │
│ Clarifications   │ 5     │ 6.6%  │
│ Other            │ 27    │ 35.5% │
└──────────────────┴───────┴───────┘

Score Distribution:
┌─────────────────┬───────┬───────┐
│ Rating          │ Count │ %     │
├─────────────────┼───────┼───────┤
│ Excellent (90+) │ 0     │ 0.0%  │
│ Good (70-89)    │ 1     │ 1.3%  │
│ Fair (50-69)    │ 75    │ 98.7% │
│ Poor (<50)      │ 0     │ 0.0%  │
└─────────────────┴───────┴───────┘

📝 CURSOR

┌───────────────┬────────┐
│ Total Prompts │ 43     │
│ Average Score │ 61/100 │
│ Transcripts   │ 3      │
└───────────────┴────────┘
...
```

## What the Report Shows

### Prompt Types

| Type | Examples |
|------|----------|
| **Code Generation** | "Create a function...", "Implement...", "Build a component..." |
| **Questions** | "What is...", "How do I...", "Why does...", "Can you explain..." |
| **File Operations** | "Read file...", "Find files matching...", "Search for..." |
| **Commands/Actions** | "Run tests", "Fix the bug", "Update the config", "Deploy" |
| **Clarifications** | "No, I meant...", "Actually...", "Not that, the other one" |
| **Other** | Everything else |

### Score Ratings

| Rating | Score | What it Means |
|--------|-------|---------------|
| **Excellent** | 90-100 | Specific, clear context, actionable |
| **Good** | 70-89 | Solid prompts with minor improvements possible |
| **Fair** | 50-69 | Works but could be more specific |
| **Poor** | 0-49 | Vague, missing context, or retries |

## All Commands

### Global (Both Claude Code & Cursor)

```bash
prompt-prof report              # Comprehensive report (default: 7 days)
prompt-prof report -d 1         # Today only
prompt-prof report -d 30        # Past 30 days
prompt-prof stats               # Quick stats overview
```

### Claude Code

```bash
# Reports
prompt-prof claude report daily              # Today's summary
prompt-prof claude report daily -d 2026-01-22  # Specific date
prompt-prof claude report weekly             # Past 7 days

# Find Best & Worst Prompts
prompt-prof claude patterns best             # Top 10 prompts
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
prompt-prof cursor report summary            # Usage summary (default: 7 days)
prompt-prof cursor report summary -d 30      # Past 30 days

# Find Best & Worst Prompts
prompt-prof cursor patterns best             # Top 10 prompts
prompt-prof cursor patterns worst            # Bottom 10 prompts

# Transcripts
prompt-prof cursor list transcripts          # Recent transcripts
prompt-prof cursor analyze <transcriptId>    # Analyze specific transcript

# Database Stats
prompt-prof cursor stats                     # Code generations, models, file types
```

## Quality Scoring System

Each prompt is scored 0-100 based on 4 dimensions:

### Clarity (25%)
| Factor | Points |
|--------|--------|
| File/function references | +10 |
| Clear action verbs (create, fix, update) | +8 |
| Line numbers, error messages, code snippets | +5 |
| Vague commands ("fix it", "make it work") | -15 |
| Short prompts without context | -10 |

### Context (25%)
| Factor | Points |
|--------|--------|
| Proper follow-up references | +10 |
| References recent tool output | +8 |
| Cold start with unclear reference | -15 |
| Assumes missing context | -10 |

### Efficiency (25%)
| Factor | Points |
|--------|--------|
| Retry of previous prompt (>60% similar) | -20 |
| Excessive verbosity (500+ words) | -10 |

### Outcome (25%)
| Factor | Points |
|--------|--------|
| High tool success rate | +10 |
| Required clarification follow-up | -15 |
| Conversation loop detected | -20 |

## Data Sources

The tool reads local data from your AI assistants:

### Claude Code (`~/.claude/`)
- `projects/[path]/[sessionId].jsonl` - Full conversation history
- `stats-cache.json` - Aggregated usage statistics

### Cursor (`~/.cursor/`)
- `projects/[project]/agent-transcripts/*.txt` - Agent conversations
- `ai-tracking/ai-code-tracking.db` - SQLite database with code generation stats

**Note:** All analysis happens locally. No data is sent anywhere.

## Programmatic Usage (SDK)

```typescript
import {
  // Claude Code
  parseSessions,
  analyzeSessionPrompts,
  calculateAverageQuality,

  // Cursor
  parseCursorTranscripts,
  analyzeCursorTranscriptPrompts,

  // Classification
  classifyPrompt,
  calculatePromptStats,
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
  // Process results...
}

// Classify a single prompt
const type = classifyPrompt("Create a REST API endpoint for users");
// Returns: 'code_generation'
```

## Tips for Better Prompts

Based on the scoring system:

1. **Be specific** - Include file names, function names, line numbers
   - Bad: "Fix the bug"
   - Good: "Fix the TypeError in src/api/users.ts:42"

2. **Use action verbs** - "Create", "Fix", "Update", "Refactor"
   - Bad: "The login doesn't work"
   - Good: "Fix the login validation that rejects valid emails"

3. **Provide context** - Include error messages, expected behavior
   - Bad: "It's broken"
   - Good: "Getting 'Cannot read property of undefined' when clicking submit"

4. **Avoid vague language** - Skip "fix it", "make it work", "do it"
   - Bad: "Do the same thing for the other file"
   - Good: "Apply the same validation logic to src/api/orders.ts"

5. **Reduce clarifications** - Be specific upfront
   - If you find yourself saying "No, I meant..." often, add more detail initially

## Contributing

Issues and PRs welcome at [github.com/sanketagarwal/prompt-prof](https://github.com/sanketagarwal/prompt-prof)

## License

MIT
