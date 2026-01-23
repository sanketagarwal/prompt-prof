import { ParsedMessage } from '../types/claude-data';
import { CursorMessage, CursorTranscript } from '../types/cursor-data';

export type PromptType = 'code_generation' | 'question' | 'file_operation' | 'command' | 'clarification' | 'other';

export interface ClassifiedPrompt {
  prompt: string;
  type: PromptType;
  score: number;
}

export interface PromptStats {
  total: number;
  codeGeneration: number;
  questions: number;
  fileOperations: number;
  commands: number;
  clarifications: number;
  other: number;
  avgScore: number;
  scoreDistribution: {
    excellent: number; // 90+
    good: number;      // 70-89
    fair: number;      // 50-69
    poor: number;      // <50
  };
}

// Patterns for code generation prompts
const CODE_GENERATION_PATTERNS = [
  /\b(create|implement|build|write|add|generate|make)\b.*\b(function|class|component|api|endpoint|service|module|handler|hook|util)/i,
  /\b(create|implement|build|write|add)\b.*\b(feature|functionality|logic)/i,
  /\bnew\s+(file|component|class|function|module)/i,
  /\bimplement\b/i,
  /\brefactor\b/i,
  /\badd\s+(a|the|new)?\s*(method|function|class|property|field)/i,
];

// Patterns for questions
const QUESTION_PATTERNS = [
  /^(what|why|how|where|when|which|can you|could you|is there|are there|do you|does|did|will|would)\b/i,
  /\?$/,
  /\bexplain\b/i,
  /\bwhat('s| is| are)\b/i,
  /\bhow (do|does|can|to)\b/i,
  /\btell me\b/i,
  /\bshow me\b/i,
];

// Patterns for file operations
const FILE_OPERATION_PATTERNS = [
  /\b(read|open|view|show|display|cat|look at)\b.*\b(file|content)/i,
  /\b(find|search|grep|locate)\b.*\b(file|in|for)/i,
  /\b(list|ls)\b.*\b(files?|directory|folder)/i,
  /\b(delete|remove|rm)\b.*\b(file|folder|directory)/i,
  /\b(move|rename|copy|cp|mv)\b.*\b(file|folder)/i,
];

// Patterns for commands/actions
const COMMAND_PATTERNS = [
  /\b(run|execute|start|stop|restart|deploy|test|build|install|npm|yarn|git|docker)\b/i,
  /\b(fix|debug|solve|resolve)\b.*\b(error|bug|issue|problem)/i,
  /\bupdate\b/i,
  /\bchange\b/i,
  /\bmodify\b/i,
];

// Patterns for clarifications/corrections
const CLARIFICATION_PATTERNS = [
  /^(no|not|nope|wrong|incorrect)/i,
  /\bi meant\b/i,
  /\bi mean\b/i,
  /\bactually\b/i,
  /\binstead\b/i,
  /\brather\b/i,
  /^(ok|okay|yes|yeah|sure|right|correct)\s+(do|run|go|now|please)/i,
];

/**
 * Classify a prompt into a type
 */
export function classifyPrompt(prompt: string): PromptType {
  const trimmed = prompt.trim();

  if (!trimmed || trimmed.length < 3) {
    return 'other';
  }

  // Check patterns in order of specificity
  if (CLARIFICATION_PATTERNS.some(p => p.test(trimmed))) {
    return 'clarification';
  }

  if (CODE_GENERATION_PATTERNS.some(p => p.test(trimmed))) {
    return 'code_generation';
  }

  if (QUESTION_PATTERNS.some(p => p.test(trimmed))) {
    return 'question';
  }

  if (FILE_OPERATION_PATTERNS.some(p => p.test(trimmed))) {
    return 'file_operation';
  }

  if (COMMAND_PATTERNS.some(p => p.test(trimmed))) {
    return 'command';
  }

  return 'other';
}

/**
 * Also check response to better classify
 */
export function classifyPromptWithResponse(
  prompt: string,
  response: ParsedMessage | CursorMessage | null
): PromptType {
  const baseType = classifyPrompt(prompt);

  if (baseType !== 'other') {
    return baseType;
  }

  // Check if response indicates code generation
  if (response) {
    const hasCodeTools = 'toolUses' in response && response.toolUses?.some(
      t => ['Write', 'Edit', 'StrReplace'].includes(t.name)
    );

    if (hasCodeTools) {
      return 'code_generation';
    }

    const hasFileTools = 'toolUses' in response && response.toolUses?.some(
      t => ['Read', 'Glob', 'Grep', 'LS'].includes(t.name)
    );

    if (hasFileTools) {
      return 'file_operation';
    }

    const hasBashTools = 'toolUses' in response && response.toolUses?.some(
      t => ['Bash', 'Shell'].includes(t.name)
    );

    if (hasBashTools) {
      return 'command';
    }
  }

  return 'other';
}

/**
 * Calculate prompt statistics
 */
export function calculatePromptStats(
  classifiedPrompts: ClassifiedPrompt[]
): PromptStats {
  const stats: PromptStats = {
    total: classifiedPrompts.length,
    codeGeneration: 0,
    questions: 0,
    fileOperations: 0,
    commands: 0,
    clarifications: 0,
    other: 0,
    avgScore: 0,
    scoreDistribution: {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
    },
  };

  if (classifiedPrompts.length === 0) {
    return stats;
  }

  let totalScore = 0;

  for (const cp of classifiedPrompts) {
    totalScore += cp.score;

    // Count by type
    switch (cp.type) {
      case 'code_generation':
        stats.codeGeneration++;
        break;
      case 'question':
        stats.questions++;
        break;
      case 'file_operation':
        stats.fileOperations++;
        break;
      case 'command':
        stats.commands++;
        break;
      case 'clarification':
        stats.clarifications++;
        break;
      default:
        stats.other++;
    }

    // Score distribution
    if (cp.score >= 90) {
      stats.scoreDistribution.excellent++;
    } else if (cp.score >= 70) {
      stats.scoreDistribution.good++;
    } else if (cp.score >= 50) {
      stats.scoreDistribution.fair++;
    } else {
      stats.scoreDistribution.poor++;
    }
  }

  stats.avgScore = Math.round(totalScore / classifiedPrompts.length);

  return stats;
}

/**
 * Get type label for display
 */
export function getTypeLabel(type: PromptType): string {
  switch (type) {
    case 'code_generation':
      return 'Code Generation';
    case 'question':
      return 'Question';
    case 'file_operation':
      return 'File Operation';
    case 'command':
      return 'Command/Action';
    case 'clarification':
      return 'Clarification';
    default:
      return 'Other';
  }
}
