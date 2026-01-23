import { ParsedSession, ParsedMessage, PromptQualityScore } from '../types/claude-data';
import { calculateClarityScore } from '../scoring/clarity';
import { calculateContextScore } from '../scoring/context';
import { calculateOutcomeScore } from '../scoring/outcome';
import { RETRY_SIMILARITY_THRESHOLD, RETRY_LOOKBACK_COUNT } from '../core/constants';
import natural from 'natural';

const { JaroWinklerDistance } = natural;

/**
 * Check if a prompt is a retry of a previous prompt
 */
export function isRetry(current: string, previous: string[]): boolean {
  const recentPrompts = previous.slice(-RETRY_LOOKBACK_COUNT);

  for (const prev of recentPrompts) {
    const similarity = JaroWinklerDistance(
      current.toLowerCase().trim(),
      prev.toLowerCase().trim()
    );
    if (similarity > RETRY_SIMILARITY_THRESHOLD) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate efficiency score based on token usage and retries
 */
function calculateEfficiencyScore(
  prompt: string,
  response: ParsedMessage | null,
  previousPrompts: string[]
): {
  score: number;
  isRetry: boolean;
  tokenRatio: number;
  issues: string[];
} {
  let score = 70; // Base score
  const issues: string[] = [];

  // Check for retry
  const retryDetected = isRetry(prompt, previousPrompts);
  if (retryDetected) {
    score -= 20;
    issues.push('Retry of previous prompt detected');
  }

  // Calculate token ratio if we have usage data
  let tokenRatio = 1;
  if (response?.usage) {
    const inputTokens = response.usage.inputTokens || 1;
    const outputTokens = response.usage.outputTokens || 0;
    tokenRatio = outputTokens / inputTokens;

    // Very high output to input ratio might indicate inefficiency
    if (tokenRatio > 10) {
      score -= 5;
      issues.push('High output/input token ratio');
    }
  }

  // Check for excessive verbosity in prompt
  const wordCount = prompt.split(/\s+/).length;
  if (wordCount > 500) {
    score -= 10;
    issues.push('Excessively long prompt');
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    isRetry: retryDetected,
    tokenRatio,
    issues,
  };
}

/**
 * Analyze a single prompt's quality
 */
export function analyzePromptQuality(
  prompt: string,
  previousMessages: ParsedMessage[],
  response: ParsedMessage | null,
  followUpMessages: ParsedMessage[],
  isFirstMessage: boolean = false
): PromptQualityScore {
  // Get previous prompts for retry detection
  const previousPrompts = previousMessages
    .filter(m => m.role === 'user')
    .map(m => m.content);

  // Calculate individual scores
  const clarityResult = calculateClarityScore(prompt);
  const contextResult = calculateContextScore(prompt, previousMessages, isFirstMessage);
  const efficiencyResult = calculateEfficiencyScore(prompt, response, previousPrompts);
  const outcomeResult = calculateOutcomeScore(response, followUpMessages, previousPrompts);

  // Calculate weighted overall score
  const overall = Math.round(
    clarityResult.score * 0.25 +
    contextResult.score * 0.25 +
    efficiencyResult.score * 0.25 +
    outcomeResult.score * 0.25
  );

  // Collect all issues and suggestions
  const issues = [
    ...clarityResult.issues,
    ...contextResult.issues,
    ...efficiencyResult.issues,
    ...outcomeResult.issues,
  ];

  const suggestions = [
    ...clarityResult.suggestions,
    ...contextResult.suggestions,
  ];

  return {
    overall,
    clarity: clarityResult.score,
    context: contextResult.score,
    efficiency: efficiencyResult.score,
    outcome: outcomeResult.score,
    issues,
    suggestions,
  };
}

/**
 * Analyze all prompts in a session
 */
export function analyzeSessionPrompts(
  session: ParsedSession
): Array<{
  uuid: string;
  prompt: string;
  score: PromptQualityScore;
  timestamp: Date;
}> {
  const results: Array<{
    uuid: string;
    prompt: string;
    score: PromptQualityScore;
    timestamp: Date;
  }> = [];

  const messages = session.messages;
  const userMessages = messages.filter(m => m.role === 'user');

  for (let i = 0; i < userMessages.length; i++) {
    const userMsg = userMessages[i];
    const msgIndex = messages.findIndex(m => m.uuid === userMsg.uuid);

    // Get previous messages
    const previousMessages = messages.slice(0, msgIndex);

    // Find the response to this prompt
    const response = messages.find(
      m => m.role === 'assistant' && m.parentUuid === userMsg.uuid
    ) || null;

    // Get follow-up messages
    const responseIndex = response ? messages.findIndex(m => m.uuid === response.uuid) : msgIndex;
    const followUpMessages = messages.slice(responseIndex + 1, responseIndex + 5);

    const score = analyzePromptQuality(
      userMsg.content,
      previousMessages,
      response,
      followUpMessages,
      i === 0
    );

    results.push({
      uuid: userMsg.uuid,
      prompt: userMsg.content,
      score,
      timestamp: userMsg.timestamp,
    });
  }

  return results;
}

/**
 * Calculate average quality score for a session
 */
export function calculateAverageQuality(
  scores: Array<{ score: PromptQualityScore }>
): number {
  if (scores.length === 0) return 0;

  const sum = scores.reduce((acc, s) => acc + s.score.overall, 0);
  return Math.round(sum / scores.length);
}

/**
 * Get quality rating label
 */
export function getQualityRating(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 30) return 'Poor';
  return 'Very Poor';
}

/**
 * Get top N prompts by score
 */
export function getTopPrompts(
  analyzedPrompts: Array<{ uuid: string; prompt: string; score: PromptQualityScore }>,
  n: number = 10
): Array<{ uuid: string; prompt: string; score: number }> {
  return [...analyzedPrompts]
    .sort((a, b) => b.score.overall - a.score.overall)
    .slice(0, n)
    .map(p => ({
      uuid: p.uuid,
      prompt: p.prompt,
      score: p.score.overall,
    }));
}

/**
 * Get bottom N prompts by score
 */
export function getWorstPrompts(
  analyzedPrompts: Array<{ uuid: string; prompt: string; score: PromptQualityScore }>,
  n: number = 10
): Array<{ uuid: string; prompt: string; score: number; issues: string[] }> {
  return [...analyzedPrompts]
    .sort((a, b) => a.score.overall - b.score.overall)
    .slice(0, n)
    .map(p => ({
      uuid: p.uuid,
      prompt: p.prompt,
      score: p.score.overall,
      issues: p.score.issues,
    }));
}
