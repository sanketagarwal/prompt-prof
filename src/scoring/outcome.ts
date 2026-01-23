import { ParsedMessage, ToolResultContent } from '../types/claude-data';
import { CLARIFICATION_PATTERNS } from '../core/constants';

export interface OutcomeResult {
  score: number;
  breakdown: {
    toolSuccess: number;
    clarificationNeeded: number;
    conversationLoop: number;
  };
  issues: string[];
  toolSuccessRate: number;
}

/**
 * Calculate tool success rate from response
 */
function calculateToolSuccessRate(response: ParsedMessage | null): {
  rate: number;
  total: number;
  successful: number;
} {
  if (!response?.toolUses?.length) {
    return { rate: 1, total: 0, successful: 0 };
  }

  // We need to look at tool results in the following user message
  // For now, assume tools were successful if there's no error indication
  const total = response.toolUses.length;

  // This would need to be enhanced to check actual tool results
  // For now, we estimate based on the presence of error patterns
  const hasErrors = response.content.toLowerCase().includes('error') ||
                   response.content.toLowerCase().includes('failed') ||
                   response.content.toLowerCase().includes('could not');

  const successful = hasErrors ? Math.floor(total * 0.7) : total;
  const rate = total > 0 ? successful / total : 1;

  return { rate, total, successful };
}

/**
 * Check if response required clarification
 */
function requiredClarification(response: ParsedMessage | null): boolean {
  if (!response) return false;

  const content = response.content.toLowerCase();
  return CLARIFICATION_PATTERNS.some(pattern => pattern.test(content));
}

/**
 * Detect conversation loop (back and forth without progress)
 */
function detectConversationLoop(
  currentPrompt: string,
  previousPrompts: string[]
): boolean {
  if (previousPrompts.length < 3) return false;

  // Check for repetitive patterns
  const recent = previousPrompts.slice(-3);
  const currentLower = currentPrompt.toLowerCase().trim();

  // Check for similar prompts
  let similarCount = 0;
  for (const prev of recent) {
    const prevLower = prev.toLowerCase().trim();

    // Check for high similarity
    if (currentLower === prevLower) {
      similarCount++;
    } else if (currentLower.includes(prevLower) || prevLower.includes(currentLower)) {
      similarCount += 0.5;
    }
  }

  return similarCount >= 1.5;
}

/**
 * Check tool results for errors
 */
export function checkToolResultErrors(toolResults: ToolResultContent[]): {
  total: number;
  errors: number;
  errorMessages: string[];
} {
  let total = toolResults.length;
  let errors = 0;
  const errorMessages: string[] = [];

  for (const result of toolResults) {
    if (result.is_error) {
      errors++;
      const content = typeof result.content === 'string'
        ? result.content
        : result.content.map(c => c.text || '').join('\n');
      errorMessages.push(content.slice(0, 100));
    }
  }

  return { total, errors, errorMessages };
}

/**
 * Calculate outcome score (0-100)
 */
export function calculateOutcomeScore(
  response: ParsedMessage | null,
  followUpMessages: ParsedMessage[],
  previousPrompts: string[]
): OutcomeResult {
  let score = 70; // Base score
  const breakdown = {
    toolSuccess: 0,
    clarificationNeeded: 0,
    conversationLoop: 0,
  };
  const issues: string[] = [];

  // Tool success rate
  const toolResult = calculateToolSuccessRate(response);
  if (toolResult.total > 0) {
    const toolScore = Math.round(toolResult.rate * 20);
    breakdown.toolSuccess = toolScore;
    score += toolScore - 10; // Adjust from base

    if (toolResult.rate < 0.8) {
      issues.push(`Tool success rate: ${Math.round(toolResult.rate * 100)}%`);
    }
  }

  // Check if clarification was required
  if (requiredClarification(response)) {
    score -= 15;
    breakdown.clarificationNeeded = -15;
    issues.push('Assistant requested clarification');
  }

  // Check for follow-up clarification in user messages
  const userFollowUps = followUpMessages.filter(m => m.role === 'user');
  for (const followUp of userFollowUps.slice(0, 2)) {
    const content = followUp.content.toLowerCase();
    if (content.includes('no,') || content.includes('not that') ||
        content.includes('i meant') || content.includes('wrong')) {
      score -= 10;
      issues.push('Required correction in follow-up');
      break;
    }
  }

  // Conversation loop detection
  const currentPrompt = followUpMessages.find(m => m.role === 'user')?.content || '';
  if (detectConversationLoop(currentPrompt, previousPrompts)) {
    score -= 20;
    breakdown.conversationLoop = -20;
    issues.push('Conversation loop detected');
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    breakdown,
    issues,
    toolSuccessRate: toolResult.rate,
  };
}

/**
 * Get outcome rating label
 */
export function getOutcomeRating(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 30) return 'Poor';
  return 'Very Poor';
}
