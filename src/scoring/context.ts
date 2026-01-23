import { ParsedMessage } from '../types/claude-data';

export interface ContextResult {
  score: number;
  breakdown: {
    properFollowUp: number;
    referencesToolOutput: number;
    coldStartUnclear: number;
    assumesMissingContext: number;
  };
  issues: string[];
  suggestions: string[];
}

/**
 * Check if prompt references recent conversation context
 */
function referencesRecentContext(prompt: string, previousMessages: ParsedMessage[]): boolean {
  const recentAssistant = previousMessages.filter(m => m.role === 'assistant').slice(-3);

  // Check for references to things mentioned in recent responses
  for (const msg of recentAssistant) {
    const content = msg.content.toLowerCase();
    const promptLower = prompt.toLowerCase();

    // Check for common reference patterns
    if (promptLower.includes('that') && content.length > 0) return true;
    if (promptLower.includes('above') || promptLower.includes('previous')) return true;
    if (promptLower.includes('the file') && content.includes('file')) return true;
    if (promptLower.includes('the function') && content.includes('function')) return true;
  }

  return false;
}

/**
 * Check if prompt references tool output (like errors, file contents)
 */
function referencesToolOutput(prompt: string, previousMessages: ParsedMessage[]): boolean {
  const lastAssistant = previousMessages.filter(m => m.role === 'assistant').pop();

  if (!lastAssistant?.toolUses?.length) return false;

  // If there were recent tool uses, check if prompt acknowledges them
  const toolNames = lastAssistant.toolUses.map(t => t.name.toLowerCase());
  const promptLower = prompt.toLowerCase();

  // Check for tool result acknowledgment patterns
  if (toolNames.includes('read') && (promptLower.includes('file') || promptLower.includes('code'))) {
    return true;
  }
  if (toolNames.includes('bash') && (promptLower.includes('output') || promptLower.includes('result'))) {
    return true;
  }
  if (toolNames.includes('grep') && promptLower.includes('found')) {
    return true;
  }

  return false;
}

/**
 * Check if this is a cold start with unclear references
 */
function isColdStartUnclear(
  prompt: string,
  previousMessages: ParsedMessage[],
  isFirstMessage: boolean
): boolean {
  // Not a cold start if there are previous messages
  if (!isFirstMessage && previousMessages.length > 0) return false;

  // Check for unclear references in first message
  const unclearPatterns = [
    /^(fix|update|change|modify) (it|this|that)\b/i,
    /^continue\b/i,
    /^do (it|this|that)\b/i,
    /the same (thing|way)/i,
  ];

  return unclearPatterns.some(pattern => pattern.test(prompt.trim()));
}

/**
 * Check if prompt assumes context that may not exist
 */
function assumesMissingContext(
  prompt: string,
  previousMessages: ParsedMessage[]
): boolean {
  const hasRecent = previousMessages.length > 0;

  // References that require prior context
  const contextRequiredPatterns = [
    /^(also|and|but|then|now)\s+/i,
    /as (I|we) (discussed|mentioned|said)/i,
    /the (same|other) (file|function|component)/i,
    /like (before|earlier|previously)/i,
  ];

  if (!hasRecent) {
    return contextRequiredPatterns.some(pattern => pattern.test(prompt));
  }

  // Check if references things not mentioned in recent context
  const recentContent = previousMessages
    .slice(-5)
    .map(m => m.content.toLowerCase())
    .join(' ');

  // Check for specific file references that don't exist in recent context
  const fileMatch = prompt.match(/(?:in|the|file)\s+([a-zA-Z0-9_.-]+\.[a-z]+)/i);
  if (fileMatch && !recentContent.includes(fileMatch[1].toLowerCase())) {
    return false; // Actually good - they're being specific
  }

  return false;
}

/**
 * Calculate context score (0-100)
 */
export function calculateContextScore(
  prompt: string,
  previousMessages: ParsedMessage[],
  isFirstMessage: boolean = false
): ContextResult {
  let score = 60; // Base score
  const breakdown = {
    properFollowUp: 0,
    referencesToolOutput: 0,
    coldStartUnclear: 0,
    assumesMissingContext: 0,
  };
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Positive factors
  if (!isFirstMessage && referencesRecentContext(prompt, previousMessages)) {
    score += 10;
    breakdown.properFollowUp = 10;
  }

  if (referencesToolOutput(prompt, previousMessages)) {
    score += 8;
    breakdown.referencesToolOutput = 8;
  }

  // Negative factors
  if (isColdStartUnclear(prompt, previousMessages, isFirstMessage)) {
    score -= 15;
    breakdown.coldStartUnclear = -15;
    issues.push('Unclear reference at start of conversation');
    suggestions.push('Start with specific context about what you want to work on');
  }

  if (assumesMissingContext(prompt, previousMessages)) {
    score -= 10;
    breakdown.assumesMissingContext = -10;
    issues.push('References context that may not exist');
    suggestions.push('Provide explicit context or file paths');
  }

  // First message bonus for good context
  if (isFirstMessage && prompt.length > 50 && !isColdStartUnclear(prompt, previousMessages, isFirstMessage)) {
    score += 5;
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
 * Get context rating label
 */
export function getContextRating(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 30) return 'Poor';
  return 'Very Poor';
}
