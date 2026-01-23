import { CursorTranscript, CursorMessage } from '../types/cursor-data';
import { PromptQualityScore } from '../types/claude-data';
import { calculateClarityScore } from '../scoring/clarity';
import { RETRY_SIMILARITY_THRESHOLD, RETRY_LOOKBACK_COUNT } from '../core/constants';
import natural from 'natural';

const { JaroWinklerDistance } = natural;

/**
 * Check if a prompt is a retry of a previous prompt
 */
function isRetry(current: string, previous: string[]): boolean {
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
 * Calculate context score for Cursor prompts
 */
function calculateCursorContextScore(
  prompt: string,
  previousMessages: CursorMessage[],
  isFirstMessage: boolean
): { score: number; issues: string[] } {
  let score = 60;
  const issues: string[] = [];

  // Check for proper follow-up references
  const hasRecentContext = previousMessages.length > 0;

  if (!isFirstMessage && hasRecentContext) {
    // Check if prompt references previous context
    const referencesContext = /\b(that|this|above|previous|earlier|the file|the function|the error)\b/i.test(prompt);
    if (referencesContext) {
      score += 10;
    }
  }

  // Check for cold start issues
  const coldStartPatterns = [
    /^(fix|update|change|modify) (it|this|that)\b/i,
    /^continue\b/i,
    /^do (it|this|that)\b/i,
  ];

  if (isFirstMessage) {
    for (const pattern of coldStartPatterns) {
      if (pattern.test(prompt.trim())) {
        score -= 15;
        issues.push('Unclear reference at start of conversation');
        break;
      }
    }
  }

  // Check for good first message context
  if (isFirstMessage && prompt.length > 50 && !issues.length) {
    score += 5;
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

/**
 * Calculate efficiency score for Cursor prompts
 */
function calculateCursorEfficiencyScore(
  prompt: string,
  previousPrompts: string[]
): { score: number; isRetry: boolean; issues: string[] } {
  let score = 70;
  const issues: string[] = [];

  // Check for retry
  const retryDetected = isRetry(prompt, previousPrompts);
  if (retryDetected) {
    score -= 20;
    issues.push('Retry of previous prompt detected');
  }

  // Check for excessive verbosity
  const wordCount = prompt.split(/\s+/).length;
  if (wordCount > 500) {
    score -= 10;
    issues.push('Excessively long prompt');
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    isRetry: retryDetected,
    issues,
  };
}

/**
 * Calculate outcome score based on assistant response
 */
function calculateCursorOutcomeScore(
  response: CursorMessage | null,
  followUpMessages: CursorMessage[]
): { score: number; issues: string[]; toolSuccessRate: number } {
  let score = 70;
  const issues: string[] = [];

  if (!response) {
    return { score, issues, toolSuccessRate: 1 };
  }

  // Check tool success rate
  const toolCalls = response.toolCalls?.length || 0;
  let toolSuccessRate = 1;

  if (toolCalls > 0) {
    // Check for error indicators in response
    const hasErrors = response.content.toLowerCase().includes('error') ||
                     response.content.toLowerCase().includes('failed') ||
                     response.thinking?.toLowerCase().includes('error');

    if (hasErrors) {
      toolSuccessRate = 0.7;
      score -= 10;
      issues.push('Tool execution may have had errors');
    }
  }

  // Check for clarification requests
  const clarificationPatterns = [
    /what do you mean/i,
    /can you clarify/i,
    /which file/i,
    /which function/i,
    /could you specify/i,
    /please provide more/i,
  ];

  for (const pattern of clarificationPatterns) {
    if (pattern.test(response.content)) {
      score -= 15;
      issues.push('Assistant requested clarification');
      break;
    }
  }

  // Check for corrections in follow-up
  for (const followUp of followUpMessages.slice(0, 2)) {
    if (followUp.role === 'user') {
      const content = followUp.content.toLowerCase();
      if (content.includes('no,') || content.includes('not that') ||
          content.includes('i meant') || content.includes('wrong')) {
        score -= 10;
        issues.push('Required correction in follow-up');
        break;
      }
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    toolSuccessRate,
  };
}

/**
 * Analyze a single Cursor prompt's quality
 */
export function analyzeCursorPromptQuality(
  prompt: string,
  previousMessages: CursorMessage[],
  response: CursorMessage | null,
  followUpMessages: CursorMessage[],
  isFirstMessage: boolean = false
): PromptQualityScore {
  // Get previous prompts for retry detection
  const previousPrompts = previousMessages
    .filter(m => m.role === 'user')
    .map(m => m.content);

  // Calculate individual scores
  const clarityResult = calculateClarityScore(prompt);
  const contextResult = calculateCursorContextScore(prompt, previousMessages, isFirstMessage);
  const efficiencyResult = calculateCursorEfficiencyScore(prompt, previousPrompts);
  const outcomeResult = calculateCursorOutcomeScore(response, followUpMessages);

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

  const suggestions = [...clarityResult.suggestions];

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
 * Analyze all prompts in a Cursor transcript
 */
export function analyzeCursorTranscriptPrompts(
  transcript: CursorTranscript
): Array<{
  prompt: string;
  score: PromptQualityScore;
  index: number;
}> {
  const results: Array<{
    prompt: string;
    score: PromptQualityScore;
    index: number;
  }> = [];

  const messages = transcript.messages;
  const userMessages = messages.filter(m => m.role === 'user');

  for (let i = 0; i < userMessages.length; i++) {
    const userMsg = userMessages[i];
    const msgIndex = messages.findIndex(m => m === userMsg);

    // Get previous messages
    const previousMessages = messages.slice(0, msgIndex);

    // Find the response to this prompt (next assistant message)
    const response = messages.slice(msgIndex + 1).find(m => m.role === 'assistant') || null;

    // Get follow-up messages
    const responseIndex = response ? messages.findIndex(m => m === response) : msgIndex;
    const followUpMessages = messages.slice(responseIndex + 1, responseIndex + 5);

    const score = analyzeCursorPromptQuality(
      userMsg.content,
      previousMessages,
      response,
      followUpMessages,
      i === 0
    );

    results.push({
      prompt: userMsg.content,
      score,
      index: i,
    });
  }

  return results;
}

/**
 * Calculate average quality score for a transcript
 */
export function calculateCursorAverageQuality(
  scores: Array<{ score: PromptQualityScore }>
): number {
  if (scores.length === 0) return 0;

  const sum = scores.reduce((acc, s) => acc + s.score.overall, 0);
  return Math.round(sum / scores.length);
}

/**
 * Get best prompts from analyzed transcripts
 */
export function getCursorBestPrompts(
  analyzedPrompts: Array<{ prompt: string; score: PromptQualityScore }>,
  n: number = 10
): Array<{ prompt: string; score: number }> {
  return [...analyzedPrompts]
    .sort((a, b) => b.score.overall - a.score.overall)
    .slice(0, n)
    .map(p => ({
      prompt: p.prompt,
      score: p.score.overall,
    }));
}

/**
 * Get worst prompts from analyzed transcripts
 */
export function getCursorWorstPrompts(
  analyzedPrompts: Array<{ prompt: string; score: PromptQualityScore }>,
  n: number = 10
): Array<{ prompt: string; score: number; issues: string[] }> {
  return [...analyzedPrompts]
    .sort((a, b) => a.score.overall - b.score.overall)
    .slice(0, n)
    .map(p => ({
      prompt: p.prompt,
      score: p.score.overall,
      issues: p.score.issues,
    }));
}

/**
 * Detect retry patterns in a Cursor transcript
 */
export function detectCursorRetries(transcript: CursorTranscript): {
  count: number;
  rate: number;
  retryPrompts: string[];
} {
  const userMessages = transcript.messages.filter(m => m.role === 'user');
  const retryPrompts: string[] = [];
  const previousPrompts: string[] = [];

  for (const msg of userMessages) {
    if (isRetry(msg.content, previousPrompts)) {
      retryPrompts.push(msg.content);
    }
    previousPrompts.push(msg.content);
  }

  return {
    count: retryPrompts.length,
    rate: userMessages.length > 0 ? (retryPrompts.length / userMessages.length) * 100 : 0,
    retryPrompts,
  };
}
