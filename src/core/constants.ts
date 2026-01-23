// Model pricing per 1M tokens (in USD)
export const MODEL_PRICING: Record<string, {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}> = {
  // Opus 4.5
  'claude-opus-4-5-20251101': {
    input: 5.00,
    output: 25.00,
    cacheRead: 0.50,
    cacheWrite: 6.25,
  },
  'claude-4-opus-20250514': {
    input: 5.00,
    output: 25.00,
    cacheRead: 0.50,
    cacheWrite: 6.25,
  },
  // Sonnet 4.5
  'claude-sonnet-4-5-20250514': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheWrite: 3.75,
  },
  'claude-sonnet-4-20250514': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheWrite: 3.75,
  },
  // Sonnet 3.5
  'claude-3-5-sonnet-20241022': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheWrite: 3.75,
  },
  'claude-3-5-sonnet-20240620': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheWrite: 3.75,
  },
  // Haiku
  'claude-3-5-haiku-20241022': {
    input: 1.00,
    output: 5.00,
    cacheRead: 0.10,
    cacheWrite: 1.25,
  },
  'claude-3-haiku-20240307': {
    input: 0.25,
    output: 1.25,
    cacheRead: 0.03,
    cacheWrite: 0.30,
  },
};

// Default pricing for unknown models (use Sonnet pricing as default)
export const DEFAULT_PRICING = {
  input: 3.00,
  output: 15.00,
  cacheRead: 0.30,
  cacheWrite: 3.75,
};

// Quality scoring thresholds
export const QUALITY_THRESHOLDS = {
  EXCELLENT: 90,
  GOOD: 70,
  FAIR: 50,
  POOR: 30,
};

// Retry detection
export const RETRY_SIMILARITY_THRESHOLD = 0.6;
export const RETRY_LOOKBACK_COUNT = 5;

// Vague prompt patterns
export const VAGUE_PATTERNS = [
  /^fix it$/i,
  /^make it work$/i,
  /^do it$/i,
  /^try again$/i,
  /^again$/i,
  /^same thing$/i,
  /^do the same$/i,
  /^do that again$/i,
  /^continue$/i,
  /^go ahead$/i,
  /^yes$/i,
  /^no$/i,
  /^ok$/i,
  /^okay$/i,
];

// Clear action verbs that indicate good prompts
export const ACTION_VERBS = [
  'create',
  'add',
  'implement',
  'fix',
  'update',
  'refactor',
  'remove',
  'delete',
  'modify',
  'change',
  'build',
  'write',
  'debug',
  'test',
  'deploy',
  'configure',
  'setup',
  'install',
  'migrate',
  'optimize',
  'improve',
];

// File reference patterns
export const FILE_REFERENCE_PATTERNS = [
  /[\w-]+\.(ts|js|tsx|jsx|py|go|rs|java|cpp|c|h|json|yaml|yml|md|txt|html|css|scss|sql)/i,
  /src\//,
  /lib\//,
  /tests?\//,
  /\.\/[\w-]+/,
  /\/[\w-]+\/[\w-]+/,
];

// Code reference patterns
export const CODE_REFERENCE_PATTERNS = [
  /line \d+/i,
  /:\d+/,
  /function \w+/i,
  /class \w+/i,
  /error:/i,
  /exception:/i,
  /```[\s\S]*```/,
  /`[^`]+`/,
];

// Clarification follow-up patterns
export const CLARIFICATION_PATTERNS = [
  /what do you mean/i,
  /can you clarify/i,
  /i don't understand/i,
  /which file/i,
  /which function/i,
  /could you specify/i,
  /please provide more/i,
  /i need more context/i,
  /what exactly/i,
];

// Common tools in Claude Code
export const COMMON_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'Task',
  'WebFetch',
  'WebSearch',
  'AskUserQuestion',
];

// Claude data directory
export const CLAUDE_DATA_DIR = `${process.env.HOME}/.claude`;
export const PROJECTS_DIR = `${CLAUDE_DATA_DIR}/projects`;
export const STATS_CACHE_FILE = `${CLAUDE_DATA_DIR}/stats-cache.json`;
export const HISTORY_FILE = `${CLAUDE_DATA_DIR}/history.jsonl`;
