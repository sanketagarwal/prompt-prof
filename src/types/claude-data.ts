import { z } from 'zod';

// Token usage structure
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

// Content block types
export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
}

export type ContentBlock = TextContent | ToolUseContent | ToolResultContent;

// Message types
export interface UserMessage {
  role: 'user';
  content: string | ContentBlock[];
}

export interface AssistantMessage {
  role: 'assistant';
  content: ContentBlock[];
}

export type Message = UserMessage | AssistantMessage;

// JSONL entry types
export interface SummaryEntry {
  type: 'summary';
  summary: string;
  leafUuids: string[];
  timestamp: string;
}

export interface UserMessageEntry {
  type: 'user';
  uuid: string;
  parentUuid: string | null;
  message: UserMessage;
  timestamp: string;
  cwd?: string;
  sessionId: string;
  version?: number;
}

export interface AssistantMessageEntry {
  type: 'assistant';
  uuid: string;
  parentUuid: string | null;
  message: AssistantMessage;
  timestamp: string;
  sessionId: string;
  costUSD?: number;
  durationMs?: number;
  model?: string;
  usage?: TokenUsage;
  version?: number;
}

export type RawJSONLEntry = SummaryEntry | UserMessageEntry | AssistantMessageEntry;

// Parsed session data
export interface ParsedMessage {
  uuid: string;
  parentUuid: string | null;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolUses?: ToolUseContent[];
  toolResults?: ToolResultContent[];
  costUSD?: number;
  durationMs?: number;
  model?: string;
  usage?: TokenUsage;
}

export interface ParsedSession {
  sessionId: string;
  projectPath: string;
  messages: ParsedMessage[];
  startTime: Date;
  endTime: Date;
  totalCostUSD: number;
  totalTokens: TokenUsage;
}

// Stats cache structure
export interface StatsCache {
  totalCost?: number;
  totalTokens?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  sessions?: number;
  lastUpdated?: string;
}

// Analysis results
export interface PromptQualityScore {
  overall: number;
  clarity: number;
  context: number;
  efficiency: number;
  outcome: number;
  issues: string[];
  suggestions: string[];
}

export interface CostAnalysis {
  totalCostUSD: number;
  inputCostUSD: number;
  outputCostUSD: number;
  cacheSavingsUSD: number;
  wastedSpendUSD: number;
  costByModel: Record<string, number>;
}

export interface PatternAnalysis {
  retryCount: number;
  retryRate: number;
  toolSuccessRate: number;
  toolUsageByType: Record<string, { total: number; success: number }>;
  bestPrompts: Array<{ prompt: string; score: number; uuid: string }>;
  worstPrompts: Array<{ prompt: string; score: number; uuid: string; issues: string[] }>;
}

export interface DailyReport {
  date: Date;
  sessions: number;
  prompts: number;
  totalCostUSD: number;
  avgQualityScore: number;
  cacheHitRate: number;
  retryRate: number;
  toolSuccessRate: number;
  topPrompts: Array<{ prompt: string; score: number }>;
  worstPrompts: Array<{ prompt: string; score: number; issues: string[] }>;
}

// Zod schemas for validation
export const TokenUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadInputTokens: z.number().optional(),
  cacheCreationInputTokens: z.number().optional(),
});

export const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export const ToolUseContentSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
});

export const ToolResultContentSchema = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  content: z.union([z.string(), z.array(z.object({ type: z.string(), text: z.string().optional() }))]),
  is_error: z.boolean().optional(),
});

export const ContentBlockSchema = z.union([
  TextContentSchema,
  ToolUseContentSchema,
  ToolResultContentSchema,
]);

export const UserMessageSchema = z.object({
  role: z.literal('user'),
  content: z.union([z.string(), z.array(ContentBlockSchema)]),
});

export const AssistantMessageSchema = z.object({
  role: z.literal('assistant'),
  content: z.array(ContentBlockSchema),
});

export const SummaryEntrySchema = z.object({
  type: z.literal('summary'),
  summary: z.string(),
  leafUuids: z.array(z.string()),
  timestamp: z.string(),
});

export const UserMessageEntrySchema = z.object({
  type: z.literal('user'),
  uuid: z.string(),
  parentUuid: z.string().nullable(),
  message: UserMessageSchema,
  timestamp: z.string(),
  cwd: z.string().optional(),
  sessionId: z.string(),
  version: z.number().optional(),
});

export const AssistantMessageEntrySchema = z.object({
  type: z.literal('assistant'),
  uuid: z.string(),
  parentUuid: z.string().nullable(),
  message: AssistantMessageSchema,
  timestamp: z.string(),
  sessionId: z.string(),
  costUSD: z.number().optional(),
  durationMs: z.number().optional(),
  model: z.string().optional(),
  usage: TokenUsageSchema.optional(),
  version: z.number().optional(),
});

export const RawJSONLEntrySchema = z.union([
  SummaryEntrySchema,
  UserMessageEntrySchema,
  AssistantMessageEntrySchema,
]);
