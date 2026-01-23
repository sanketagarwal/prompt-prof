import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import {
  RawJSONLEntry,
  ParsedMessage,
  ParsedSession,
  TokenUsage,
  ContentBlock,
  ToolUseContent,
  ToolResultContent,
  UserMessageEntry,
  AssistantMessageEntry,
} from '../types/claude-data';
import { PROJECTS_DIR } from '../core/constants';

/**
 * Extract text content from a message
 */
function extractTextContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map(block => block.text)
    .join('\n');
}

/**
 * Extract tool uses from content blocks
 */
function extractToolUses(content: ContentBlock[]): ToolUseContent[] {
  return content.filter((block): block is ToolUseContent => block.type === 'tool_use');
}

/**
 * Extract tool results from content blocks
 */
function extractToolResults(content: string | ContentBlock[]): ToolResultContent[] {
  if (typeof content === 'string') {
    return [];
  }
  return content.filter((block): block is ToolResultContent => block.type === 'tool_result');
}

/**
 * Parse a single JSONL line
 */
function parseJSONLLine(line: string): RawJSONLEntry | null {
  try {
    const entry = JSON.parse(line);
    // Basic validation - check for required type field
    if (!entry.type || !['summary', 'user', 'assistant'].includes(entry.type)) {
      return null;
    }
    return entry as RawJSONLEntry;
  } catch {
    return null;
  }
}

/**
 * Parse a session JSONL file
 */
export async function parseSessionFile(filePath: string): Promise<ParsedSession | null> {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const messages: ParsedMessage[] = [];
  let sessionId = '';
  let projectPath = '';

  // Extract project path and session ID from file path
  const pathParts = filePath.split('/');
  const fileName = pathParts[pathParts.length - 1];
  sessionId = fileName.replace('.jsonl', '');

  // Find projects directory index and extract project path
  const projectsIdx = pathParts.indexOf('projects');
  if (projectsIdx !== -1) {
    projectPath = pathParts.slice(projectsIdx + 1, -1).join('/');
  }

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    const entry = parseJSONLLine(line);
    if (!entry || entry.type === 'summary') continue;

    if (entry.type === 'user') {
      const userEntry = entry as UserMessageEntry;
      messages.push({
        uuid: userEntry.uuid,
        parentUuid: userEntry.parentUuid,
        role: 'user',
        content: extractTextContent(userEntry.message.content),
        timestamp: new Date(userEntry.timestamp),
        toolResults: extractToolResults(userEntry.message.content),
      });
    } else if (entry.type === 'assistant') {
      const assistantEntry = entry as AssistantMessageEntry;
      messages.push({
        uuid: assistantEntry.uuid,
        parentUuid: assistantEntry.parentUuid,
        role: 'assistant',
        content: extractTextContent(assistantEntry.message.content),
        timestamp: new Date(assistantEntry.timestamp),
        toolUses: extractToolUses(assistantEntry.message.content),
        costUSD: assistantEntry.costUSD,
        durationMs: assistantEntry.durationMs,
        model: assistantEntry.model,
        usage: assistantEntry.usage,
      });
    }
  }

  if (messages.length === 0) {
    return null;
  }

  // Calculate totals
  const totalCostUSD = messages
    .filter(m => m.costUSD !== undefined)
    .reduce((sum, m) => sum + (m.costUSD || 0), 0);

  const totalTokens: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };

  for (const msg of messages) {
    if (msg.usage) {
      totalTokens.inputTokens += msg.usage.inputTokens || 0;
      totalTokens.outputTokens += msg.usage.outputTokens || 0;
      totalTokens.cacheReadInputTokens! += msg.usage.cacheReadInputTokens || 0;
      totalTokens.cacheCreationInputTokens! += msg.usage.cacheCreationInputTokens || 0;
    }
  }

  // Sort messages by timestamp
  messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return {
    sessionId,
    projectPath,
    messages,
    startTime: messages[0].timestamp,
    endTime: messages[messages.length - 1].timestamp,
    totalCostUSD,
    totalTokens,
  };
}

/**
 * Find all session files for a given date range
 */
export async function findSessionFiles(
  startDate?: Date,
  endDate?: Date
): Promise<string[]> {
  const sessionFiles: string[] = [];

  if (!fs.existsSync(PROJECTS_DIR)) {
    return sessionFiles;
  }

  // Recursively find all .jsonl files
  function walkDir(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          // Check file modification time if date range provided
          if (startDate || endDate) {
            const stats = fs.statSync(fullPath);
            const mtime = stats.mtime;

            if (startDate && mtime < startDate) continue;
            if (endDate && mtime > endDate) continue;
          }

          sessionFiles.push(fullPath);
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  walkDir(PROJECTS_DIR);
  return sessionFiles;
}

/**
 * Parse all sessions within a date range
 */
export async function parseSessions(
  startDate?: Date,
  endDate?: Date
): Promise<ParsedSession[]> {
  const sessionFiles = await findSessionFiles(startDate, endDate);
  const sessions: ParsedSession[] = [];

  for (const file of sessionFiles) {
    const session = await parseSessionFile(file);
    if (session) {
      // Filter by actual message timestamps if date range provided
      if (startDate || endDate) {
        const inRange = session.messages.some(m => {
          if (startDate && m.timestamp < startDate) return false;
          if (endDate && m.timestamp > endDate) return false;
          return true;
        });

        if (inRange) {
          sessions.push(session);
        }
      } else {
        sessions.push(session);
      }
    }
  }

  return sessions;
}

/**
 * Get user prompts from a session
 */
export function getUserPrompts(session: ParsedSession): ParsedMessage[] {
  return session.messages.filter(m => m.role === 'user');
}

/**
 * Get assistant responses following a user message
 */
export function getResponseToPrompt(
  session: ParsedSession,
  promptUuid: string
): ParsedMessage | null {
  return session.messages.find(
    m => m.role === 'assistant' && m.parentUuid === promptUuid
  ) || null;
}

/**
 * Build conversation thread from uuid links
 */
export function buildConversationThread(
  session: ParsedSession,
  leafUuid: string
): ParsedMessage[] {
  const thread: ParsedMessage[] = [];
  const messageMap = new Map(session.messages.map(m => [m.uuid, m]));

  let current = messageMap.get(leafUuid);
  while (current) {
    thread.unshift(current);
    current = current.parentUuid ? messageMap.get(current.parentUuid) : undefined;
  }

  return thread;
}
