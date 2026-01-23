import * as fs from 'fs';
import { StatsCache } from '../types/claude-data';
import { STATS_CACHE_FILE, HISTORY_FILE } from '../core/constants';

/**
 * Parse the stats-cache.json file
 */
export function parseStatsCache(): StatsCache | null {
  if (!fs.existsSync(STATS_CACHE_FILE)) {
    return null;
  }

  try {
    const content = fs.readFileSync(STATS_CACHE_FILE, 'utf-8');
    return JSON.parse(content) as StatsCache;
  } catch {
    return null;
  }
}

/**
 * Get quick summary from stats cache
 */
export function getQuickStats(): {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheReadTokens: number;
  sessions: number;
} | null {
  const stats = parseStatsCache();
  if (!stats) {
    return null;
  }

  return {
    totalCost: stats.totalCost || 0,
    totalInputTokens: stats.totalTokens?.input || 0,
    totalOutputTokens: stats.totalTokens?.output || 0,
    cacheReadTokens: stats.totalTokens?.cacheRead || 0,
    sessions: stats.sessions || 0,
  };
}

/**
 * Parse history.jsonl for global prompt history
 */
export async function parseHistory(): Promise<Array<{
  prompt: string;
  timestamp: Date;
  projectPath?: string;
}>> {
  if (!fs.existsSync(HISTORY_FILE)) {
    return [];
  }

  const history: Array<{
    prompt: string;
    timestamp: Date;
    projectPath?: string;
  }> = [];

  try {
    const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.prompt || entry.message) {
          history.push({
            prompt: entry.prompt || entry.message,
            timestamp: new Date(entry.timestamp || Date.now()),
            projectPath: entry.projectPath || entry.cwd,
          });
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    return [];
  }

  return history;
}

/**
 * Calculate cache hit rate from stats
 */
export function calculateCacheHitRate(stats: StatsCache | null): number {
  if (!stats?.totalTokens) {
    return 0;
  }

  const { input = 0, cacheRead = 0 } = stats.totalTokens;
  const totalInput = input + cacheRead;

  if (totalInput === 0) {
    return 0;
  }

  return (cacheRead / totalInput) * 100;
}
