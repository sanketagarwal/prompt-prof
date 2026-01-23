import {
  VAGUE_PATTERNS,
  ACTION_VERBS,
  FILE_REFERENCE_PATTERNS,
  CODE_REFERENCE_PATTERNS,
} from '../core/constants';

export interface ClarityResult {
  score: number;
  breakdown: {
    fileReferences: number;
    actionVerbs: number;
    codeReferences: number;
    vagueCommands: number;
    shortPrompt: number;
  };
  issues: string[];
  suggestions: string[];
}

/**
 * Check if prompt contains file references
 */
function hasFileReferences(prompt: string): boolean {
  return FILE_REFERENCE_PATTERNS.some(pattern => pattern.test(prompt));
}

/**
 * Check if prompt contains clear action verbs
 */
function hasActionVerbs(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();
  return ACTION_VERBS.some(verb => {
    const regex = new RegExp(`\\b${verb}\\b`, 'i');
    return regex.test(lowerPrompt);
  });
}

/**
 * Check if prompt contains code references (line numbers, errors, snippets)
 */
function hasCodeReferences(prompt: string): boolean {
  return CODE_REFERENCE_PATTERNS.some(pattern => pattern.test(prompt));
}

/**
 * Check if prompt matches vague patterns
 */
function isVagueCommand(prompt: string): boolean {
  const trimmed = prompt.trim();
  return VAGUE_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Check if prompt is too short without context
 */
function isShortWithoutContext(prompt: string): boolean {
  const words = prompt.trim().split(/\s+/);
  return words.length < 5 && !hasFileReferences(prompt) && !hasCodeReferences(prompt);
}

/**
 * Calculate clarity score for a prompt (0-100)
 */
export function calculateClarityScore(prompt: string): ClarityResult {
  let score = 50; // Base score
  const breakdown = {
    fileReferences: 0,
    actionVerbs: 0,
    codeReferences: 0,
    vagueCommands: 0,
    shortPrompt: 0,
  };
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Positive factors
  if (hasFileReferences(prompt)) {
    score += 10;
    breakdown.fileReferences = 10;
  } else {
    suggestions.push('Include specific file paths for better context');
  }

  if (hasActionVerbs(prompt)) {
    score += 8;
    breakdown.actionVerbs = 8;
  } else {
    suggestions.push('Use clear action verbs (create, fix, update, etc.)');
  }

  if (hasCodeReferences(prompt)) {
    score += 5;
    breakdown.codeReferences = 5;
  }

  // Negative factors
  if (isVagueCommand(prompt)) {
    score -= 15;
    breakdown.vagueCommands = -15;
    issues.push('Prompt is too vague');
    suggestions.push('Be specific about what needs to be done');
  }

  if (isShortWithoutContext(prompt)) {
    score -= 10;
    breakdown.shortPrompt = -10;
    issues.push('Prompt is too short without sufficient context');
    suggestions.push('Add more details or reference specific files/functions');
  }

  // Check for common improvement opportunities
  if (prompt.includes('error') && !prompt.includes('```') && !prompt.includes('Error:')) {
    suggestions.push('Include the actual error message for better debugging');
  }

  if (prompt.toLowerCase().includes('it') && !hasFileReferences(prompt)) {
    suggestions.push('Replace "it" with specific file or function names');
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    breakdown,
    issues,
    suggestions,
  };
}

/**
 * Get clarity rating label
 */
export function getClarityRating(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 30) return 'Poor';
  return 'Very Poor';
}
