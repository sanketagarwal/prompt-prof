import { ParsedSession, ParsedMessage, TokenUsage, CostAnalysis } from '../types/claude-data';
import { MODEL_PRICING, DEFAULT_PRICING } from '../core/constants';

/**
 * Get pricing for a model
 */
function getModelPricing(model: string | undefined): {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
} {
  if (!model) return DEFAULT_PRICING;

  // Try exact match first
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }

  // Try partial match
  const lowerModel = model.toLowerCase();
  if (lowerModel.includes('opus')) {
    return MODEL_PRICING['claude-opus-4-5-20251101'];
  }
  if (lowerModel.includes('haiku')) {
    return MODEL_PRICING['claude-3-5-haiku-20241022'];
  }
  if (lowerModel.includes('sonnet')) {
    return MODEL_PRICING['claude-sonnet-4-5-20250514'];
  }

  return DEFAULT_PRICING;
}

/**
 * Calculate cost for a single message
 */
export function calculateMessageCost(
  usage: TokenUsage | undefined,
  model: string | undefined
): {
  total: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
} {
  if (!usage) {
    return { total: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  }

  const pricing = getModelPricing(model);

  // Calculate costs (pricing is per 1M tokens)
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  const cacheReadCost = ((usage.cacheReadInputTokens || 0) / 1_000_000) * pricing.cacheRead;
  const cacheWriteCost = ((usage.cacheCreationInputTokens || 0) / 1_000_000) * pricing.cacheWrite;

  return {
    total: inputCost + outputCost + cacheReadCost + cacheWriteCost,
    input: inputCost,
    output: outputCost,
    cacheRead: cacheReadCost,
    cacheWrite: cacheWriteCost,
  };
}

/**
 * Calculate cache savings
 */
export function calculateCacheSavings(
  usage: TokenUsage,
  model: string | undefined
): number {
  const pricing = getModelPricing(model);
  const cacheReadTokens = usage.cacheReadInputTokens || 0;

  // Savings = what it would have cost as regular input - what it actually cost as cache read
  const wouldHaveCost = (cacheReadTokens / 1_000_000) * pricing.input;
  const actualCost = (cacheReadTokens / 1_000_000) * pricing.cacheRead;

  return wouldHaveCost - actualCost;
}

/**
 * Analyze costs for a session
 */
export function analyzeSessionCost(session: ParsedSession): CostAnalysis {
  let totalCostUSD = 0;
  let inputCostUSD = 0;
  let outputCostUSD = 0;
  let cacheSavingsUSD = 0;
  let wastedSpendUSD = 0;
  const costByModel: Record<string, number> = {};

  const assistantMessages = session.messages.filter(m => m.role === 'assistant');

  for (const msg of assistantMessages) {
    if (msg.costUSD !== undefined) {
      totalCostUSD += msg.costUSD;
    }

    if (msg.usage) {
      const cost = calculateMessageCost(msg.usage, msg.model);
      inputCostUSD += cost.input;
      outputCostUSD += cost.output;

      // Track cache savings
      cacheSavingsUSD += calculateCacheSavings(msg.usage, msg.model);

      // Track by model
      const modelKey = msg.model || 'unknown';
      costByModel[modelKey] = (costByModel[modelKey] || 0) + cost.total;
    }
  }

  // Calculate wasted spend from failed tool uses and retries
  // This is a simplified calculation
  const failedToolMessages = assistantMessages.filter(msg => {
    return msg.content.toLowerCase().includes('error') ||
           msg.content.toLowerCase().includes('failed');
  });

  for (const msg of failedToolMessages) {
    if (msg.usage) {
      const cost = calculateMessageCost(msg.usage, msg.model);
      wastedSpendUSD += cost.total * 0.3; // Estimate 30% as waste
    }
  }

  return {
    totalCostUSD: totalCostUSD || (inputCostUSD + outputCostUSD),
    inputCostUSD,
    outputCostUSD,
    cacheSavingsUSD,
    wastedSpendUSD,
    costByModel,
  };
}

/**
 * Analyze costs for multiple sessions
 */
export function analyzeMultiSessionCost(sessions: ParsedSession[]): CostAnalysis {
  const combined: CostAnalysis = {
    totalCostUSD: 0,
    inputCostUSD: 0,
    outputCostUSD: 0,
    cacheSavingsUSD: 0,
    wastedSpendUSD: 0,
    costByModel: {},
  };

  for (const session of sessions) {
    const analysis = analyzeSessionCost(session);
    combined.totalCostUSD += analysis.totalCostUSD;
    combined.inputCostUSD += analysis.inputCostUSD;
    combined.outputCostUSD += analysis.outputCostUSD;
    combined.cacheSavingsUSD += analysis.cacheSavingsUSD;
    combined.wastedSpendUSD += analysis.wastedSpendUSD;

    for (const [model, cost] of Object.entries(analysis.costByModel)) {
      combined.costByModel[model] = (combined.costByModel[model] || 0) + cost;
    }
  }

  return combined;
}

/**
 * Format cost as USD string
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Calculate cost per prompt
 */
export function calculateCostPerPrompt(session: ParsedSession): number {
  const userMessages = session.messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) return 0;

  return session.totalCostUSD / userMessages.length;
}

/**
 * Get cost breakdown by category
 */
export function getCostBreakdown(analysis: CostAnalysis): Array<{
  category: string;
  amount: number;
  percentage: number;
}> {
  const total = analysis.totalCostUSD || 1;

  return [
    {
      category: 'Input Tokens',
      amount: analysis.inputCostUSD,
      percentage: (analysis.inputCostUSD / total) * 100,
    },
    {
      category: 'Output Tokens',
      amount: analysis.outputCostUSD,
      percentage: (analysis.outputCostUSD / total) * 100,
    },
    {
      category: 'Cache Savings',
      amount: -analysis.cacheSavingsUSD,
      percentage: 0, // Savings don't count toward total
    },
    {
      category: 'Estimated Waste',
      amount: analysis.wastedSpendUSD,
      percentage: (analysis.wastedSpendUSD / total) * 100,
    },
  ];
}
