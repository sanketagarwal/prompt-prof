import { ParsedSession, ParsedMessage, PatternAnalysis } from '../types/claude-data';
import { isRetry, analyzeSessionPrompts, getTopPrompts, getWorstPrompts } from './prompt-quality';

/**
 * Detect retry patterns in a session
 */
export function detectRetries(session: ParsedSession): {
  count: number;
  rate: number;
  retryPrompts: Array<{ uuid: string; prompt: string }>;
} {
  const userMessages = session.messages.filter(m => m.role === 'user');
  const retryPrompts: Array<{ uuid: string; prompt: string }> = [];

  const previousPrompts: string[] = [];
  for (const msg of userMessages) {
    if (isRetry(msg.content, previousPrompts)) {
      retryPrompts.push({ uuid: msg.uuid, prompt: msg.content });
    }
    previousPrompts.push(msg.content);
  }

  return {
    count: retryPrompts.length,
    rate: userMessages.length > 0 ? (retryPrompts.length / userMessages.length) * 100 : 0,
    retryPrompts,
  };
}

/**
 * Analyze tool usage patterns
 */
export function analyzeToolUsage(session: ParsedSession): Record<string, {
  total: number;
  success: number;
  errorRate: number;
}> {
  const toolStats: Record<string, { total: number; success: number }> = {};

  const assistantMessages = session.messages.filter(m => m.role === 'assistant');

  for (const msg of assistantMessages) {
    if (!msg.toolUses) continue;

    for (const tool of msg.toolUses) {
      if (!toolStats[tool.name]) {
        toolStats[tool.name] = { total: 0, success: 0 };
      }
      toolStats[tool.name].total++;

      // Check for errors in the tool result
      // This is simplified - we'd need to look at the following user message
      const hasError = msg.content.toLowerCase().includes('error') ||
                      msg.content.toLowerCase().includes('failed');

      if (!hasError) {
        toolStats[tool.name].success++;
      }
    }
  }

  const result: Record<string, { total: number; success: number; errorRate: number }> = {};
  for (const [name, stats] of Object.entries(toolStats)) {
    result[name] = {
      ...stats,
      errorRate: stats.total > 0 ? ((stats.total - stats.success) / stats.total) * 100 : 0,
    };
  }

  return result;
}

/**
 * Calculate overall tool success rate
 */
export function calculateToolSuccessRate(session: ParsedSession): number {
  const toolUsage = analyzeToolUsage(session);

  let totalTools = 0;
  let successfulTools = 0;

  for (const stats of Object.values(toolUsage)) {
    totalTools += stats.total;
    successfulTools += stats.success;
  }

  if (totalTools === 0) return 100; // No tools used
  return (successfulTools / totalTools) * 100;
}

/**
 * Analyze time-of-day patterns
 */
export function analyzeTimePatterns(sessions: ParsedSession[]): {
  byHour: Record<number, { prompts: number; avgScore: number }>;
  bestHours: number[];
  worstHours: number[];
} {
  const byHour: Record<number, { prompts: number; totalScore: number }> = {};

  for (const session of sessions) {
    const analyzed = analyzeSessionPrompts(session);

    for (const prompt of analyzed) {
      const hour = prompt.timestamp.getHours();

      if (!byHour[hour]) {
        byHour[hour] = { prompts: 0, totalScore: 0 };
      }

      byHour[hour].prompts++;
      byHour[hour].totalScore += prompt.score.overall;
    }
  }

  // Calculate averages
  const result: Record<number, { prompts: number; avgScore: number }> = {};
  const hourScores: Array<{ hour: number; avgScore: number }> = [];

  for (const [hour, data] of Object.entries(byHour)) {
    const h = parseInt(hour);
    const avgScore = data.prompts > 0 ? data.totalScore / data.prompts : 0;
    result[h] = { prompts: data.prompts, avgScore };
    hourScores.push({ hour: h, avgScore });
  }

  // Sort by score to find best/worst hours
  hourScores.sort((a, b) => b.avgScore - a.avgScore);
  const bestHours = hourScores.slice(0, 3).map(h => h.hour);
  const worstHours = hourScores.slice(-3).reverse().map(h => h.hour);

  return { byHour: result, bestHours, worstHours };
}

/**
 * Analyze patterns across multiple sessions
 */
export function analyzePatterns(sessions: ParsedSession[]): PatternAnalysis {
  let totalRetries = 0;
  let totalPrompts = 0;
  const allToolUsage: Record<string, { total: number; success: number }> = {};
  const allAnalyzedPrompts: Array<{
    uuid: string;
    prompt: string;
    score: { overall: number; issues: string[] };
  }> = [];

  for (const session of sessions) {
    // Retry analysis
    const retryData = detectRetries(session);
    totalRetries += retryData.count;

    // Tool usage
    const toolUsage = analyzeToolUsage(session);
    for (const [name, stats] of Object.entries(toolUsage)) {
      if (!allToolUsage[name]) {
        allToolUsage[name] = { total: 0, success: 0 };
      }
      allToolUsage[name].total += stats.total;
      allToolUsage[name].success += stats.success;
    }

    // Prompt analysis
    const analyzed = analyzeSessionPrompts(session);
    totalPrompts += analyzed.length;

    for (const p of analyzed) {
      allAnalyzedPrompts.push({
        uuid: p.uuid,
        prompt: p.prompt,
        score: {
          overall: p.score.overall,
          issues: p.score.issues,
        },
      });
    }
  }

  // Calculate overall tool success rate
  let totalTools = 0;
  let successfulTools = 0;
  for (const stats of Object.values(allToolUsage)) {
    totalTools += stats.total;
    successfulTools += stats.success;
  }

  const toolSuccessRate = totalTools > 0 ? (successfulTools / totalTools) * 100 : 100;

  // Get best/worst prompts
  const sortedPrompts = [...allAnalyzedPrompts].sort(
    (a, b) => b.score.overall - a.score.overall
  );

  const bestPrompts = sortedPrompts.slice(0, 10).map(p => ({
    prompt: p.prompt,
    score: p.score.overall,
    uuid: p.uuid,
  }));

  const worstPrompts = sortedPrompts.slice(-10).reverse().map(p => ({
    prompt: p.prompt,
    score: p.score.overall,
    uuid: p.uuid,
    issues: p.score.issues,
  }));

  return {
    retryCount: totalRetries,
    retryRate: totalPrompts > 0 ? (totalRetries / totalPrompts) * 100 : 0,
    toolSuccessRate,
    toolUsageByType: allToolUsage,
    bestPrompts,
    worstPrompts,
  };
}

/**
 * Get common issues from worst prompts
 */
export function getCommonIssues(
  worstPrompts: Array<{ issues: string[] }>
): Array<{ issue: string; count: number }> {
  const issueCounts: Record<string, number> = {};

  for (const prompt of worstPrompts) {
    for (const issue of prompt.issues) {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }

  return Object.entries(issueCounts)
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get prompt length distribution
 */
export function getPromptLengthDistribution(sessions: ParsedSession[]): {
  short: number; // < 50 chars
  medium: number; // 50-200 chars
  long: number; // 200-500 chars
  veryLong: number; // > 500 chars
} {
  const distribution = { short: 0, medium: 0, long: 0, veryLong: 0 };

  for (const session of sessions) {
    const userMessages = session.messages.filter(m => m.role === 'user');

    for (const msg of userMessages) {
      const len = msg.content.length;
      if (len < 50) distribution.short++;
      else if (len < 200) distribution.medium++;
      else if (len < 500) distribution.long++;
      else distribution.veryLong++;
    }
  }

  return distribution;
}
