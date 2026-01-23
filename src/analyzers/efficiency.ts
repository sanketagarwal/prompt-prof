import { ParsedSession, TokenUsage } from '../types/claude-data';

export interface EfficiencyMetrics {
  tokenEfficiency: number; // Output tokens / input tokens ratio
  cacheHitRate: number; // Percentage of input from cache
  averageResponseTime: number; // Average duration in ms
  tokensPerPrompt: number; // Average tokens per user prompt
  messagesPerSession: number; // Average messages per session
}

/**
 * Calculate token efficiency ratio
 */
export function calculateTokenEfficiency(totalTokens: TokenUsage): number {
  const inputTokens = totalTokens.inputTokens || 1;
  const outputTokens = totalTokens.outputTokens || 0;

  return outputTokens / inputTokens;
}

/**
 * Calculate cache hit rate
 */
export function calculateCacheHitRate(totalTokens: TokenUsage): number {
  const regularInput = totalTokens.inputTokens || 0;
  const cacheRead = totalTokens.cacheReadInputTokens || 0;

  const totalInput = regularInput + cacheRead;
  if (totalInput === 0) return 0;

  return (cacheRead / totalInput) * 100;
}

/**
 * Calculate average response time
 */
export function calculateAverageResponseTime(session: ParsedSession): number {
  const assistantMessages = session.messages.filter(m => m.role === 'assistant');
  const durationsMs = assistantMessages
    .map(m => m.durationMs)
    .filter((d): d is number => d !== undefined);

  if (durationsMs.length === 0) return 0;

  return durationsMs.reduce((sum, d) => sum + d, 0) / durationsMs.length;
}

/**
 * Calculate tokens per prompt
 */
export function calculateTokensPerPrompt(session: ParsedSession): number {
  const userMessages = session.messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) return 0;

  const totalTokens = session.totalTokens.inputTokens + session.totalTokens.outputTokens;
  return totalTokens / userMessages.length;
}

/**
 * Analyze efficiency for a session
 */
export function analyzeSessionEfficiency(session: ParsedSession): EfficiencyMetrics {
  return {
    tokenEfficiency: calculateTokenEfficiency(session.totalTokens),
    cacheHitRate: calculateCacheHitRate(session.totalTokens),
    averageResponseTime: calculateAverageResponseTime(session),
    tokensPerPrompt: calculateTokensPerPrompt(session),
    messagesPerSession: session.messages.length,
  };
}

/**
 * Analyze efficiency across multiple sessions
 */
export function analyzeMultiSessionEfficiency(sessions: ParsedSession[]): EfficiencyMetrics {
  if (sessions.length === 0) {
    return {
      tokenEfficiency: 0,
      cacheHitRate: 0,
      averageResponseTime: 0,
      tokensPerPrompt: 0,
      messagesPerSession: 0,
    };
  }

  // Aggregate tokens
  const totalTokens: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };

  let totalDurationMs = 0;
  let durationCount = 0;
  let totalPrompts = 0;
  let totalMessages = 0;

  for (const session of sessions) {
    totalTokens.inputTokens += session.totalTokens.inputTokens;
    totalTokens.outputTokens += session.totalTokens.outputTokens;
    totalTokens.cacheReadInputTokens! += session.totalTokens.cacheReadInputTokens || 0;
    totalTokens.cacheCreationInputTokens! += session.totalTokens.cacheCreationInputTokens || 0;

    const assistantMsgs = session.messages.filter(m => m.role === 'assistant');
    for (const msg of assistantMsgs) {
      if (msg.durationMs !== undefined) {
        totalDurationMs += msg.durationMs;
        durationCount++;
      }
    }

    totalPrompts += session.messages.filter(m => m.role === 'user').length;
    totalMessages += session.messages.length;
  }

  return {
    tokenEfficiency: calculateTokenEfficiency(totalTokens),
    cacheHitRate: calculateCacheHitRate(totalTokens),
    averageResponseTime: durationCount > 0 ? totalDurationMs / durationCount : 0,
    tokensPerPrompt: totalPrompts > 0
      ? (totalTokens.inputTokens + totalTokens.outputTokens) / totalPrompts
      : 0,
    messagesPerSession: totalMessages / sessions.length,
  };
}

/**
 * Get efficiency rating
 */
export function getEfficiencyRating(metrics: EfficiencyMetrics): {
  overall: string;
  details: Array<{ metric: string; rating: string; value: string }>;
} {
  const details: Array<{ metric: string; rating: string; value: string }> = [];

  // Token efficiency rating
  let tokenRating: string;
  if (metrics.tokenEfficiency >= 2) tokenRating = 'Excellent';
  else if (metrics.tokenEfficiency >= 1) tokenRating = 'Good';
  else if (metrics.tokenEfficiency >= 0.5) tokenRating = 'Fair';
  else tokenRating = 'Low';

  details.push({
    metric: 'Token Efficiency',
    rating: tokenRating,
    value: `${metrics.tokenEfficiency.toFixed(2)}x`,
  });

  // Cache hit rate rating
  let cacheRating: string;
  if (metrics.cacheHitRate >= 80) cacheRating = 'Excellent';
  else if (metrics.cacheHitRate >= 60) cacheRating = 'Good';
  else if (metrics.cacheHitRate >= 40) cacheRating = 'Fair';
  else cacheRating = 'Low';

  details.push({
    metric: 'Cache Hit Rate',
    rating: cacheRating,
    value: `${metrics.cacheHitRate.toFixed(1)}%`,
  });

  // Response time rating
  let responseRating: string;
  if (metrics.averageResponseTime < 5000) responseRating = 'Fast';
  else if (metrics.averageResponseTime < 15000) responseRating = 'Good';
  else if (metrics.averageResponseTime < 30000) responseRating = 'Moderate';
  else responseRating = 'Slow';

  details.push({
    metric: 'Response Time',
    rating: responseRating,
    value: `${(metrics.averageResponseTime / 1000).toFixed(1)}s`,
  });

  // Calculate overall rating
  const ratings = [tokenRating, cacheRating, responseRating];
  const excellentCount = ratings.filter(r => r === 'Excellent' || r === 'Fast').length;
  const goodCount = ratings.filter(r => r === 'Good').length;

  let overall: string;
  if (excellentCount >= 2) overall = 'Excellent';
  else if (excellentCount >= 1 || goodCount >= 2) overall = 'Good';
  else if (goodCount >= 1) overall = 'Fair';
  else overall = 'Needs Improvement';

  return { overall, details };
}

/**
 * Format duration in human readable form
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
