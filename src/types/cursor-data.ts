// Cursor agent transcript types

export interface CursorToolCall {
  name: string;
  parameters: Record<string, string>;
}

export interface CursorMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  toolCalls?: CursorToolCall[];
  toolResults?: string[];
  timestamp?: Date;
}

export interface CursorTranscript {
  id: string;
  projectPath: string;
  messages: CursorMessage[];
  filePath: string;
  modifiedAt: Date;
}

// SQLite database types
export interface CursorCodeHash {
  hash: string;
  source: string; // 'composer', etc.
  fileExtension?: string;
  fileName?: string;
  requestId?: string;
  conversationId?: string;
  timestamp?: number;
  createdAt: number;
  model?: string;
}

export interface CursorConversationSummary {
  conversationId: string;
  title?: string;
  tldr?: string;
  overview?: string;
  summaryBullets?: string;
  model?: string;
  mode?: string;
  updatedAt: number;
}

// Parsed cursor session (unified format)
export interface ParsedCursorSession {
  sessionId: string;
  projectPath: string;
  messages: CursorMessage[];
  startTime: Date;
  endTime: Date;
  toolCalls: number;
  userPrompts: number;
}

// Cursor stats from database
export interface CursorStats {
  totalCodeGenerations: number;
  byModel: Record<string, number>;
  bySource: Record<string, number>;
  byExtension: Record<string, number>;
  conversationCount: number;
  dateRange: {
    earliest: Date;
    latest: Date;
  };
}

// Constants for Cursor data locations
export const CURSOR_DATA_DIR = `${process.env.HOME}/.cursor`;
export const CURSOR_PROJECTS_DIR = `${CURSOR_DATA_DIR}/projects`;
export const CURSOR_DB_PATH = `${CURSOR_DATA_DIR}/ai-tracking/ai-code-tracking.db`;
export const CURSOR_PLANS_DIR = `${CURSOR_DATA_DIR}/plans`;
