import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import {
  CursorMessage,
  CursorTranscript,
  CursorToolCall,
  CursorCodeHash,
  CursorStats,
  ParsedCursorSession,
  CURSOR_PROJECTS_DIR,
  CURSOR_DB_PATH,
} from '../types/cursor-data';

/**
 * Parse a single tool call block from transcript
 */
function parseToolCall(block: string): CursorToolCall | null {
  const lines = block.trim().split('\n');
  const firstLine = lines[0];

  // Extract tool name from "[Tool call] ToolName"
  const nameMatch = firstLine.match(/\[Tool call\]\s+(\w+)/);
  if (!nameMatch) return null;

  const name = nameMatch[1];
  const parameters: Record<string, string> = {};

  // Parse parameters from subsequent lines
  for (let i = 1; i < lines.length; i++) {
    const paramMatch = lines[i].match(/^\s*(\w+):\s*(.+)$/);
    if (paramMatch) {
      parameters[paramMatch[1]] = paramMatch[2];
    }
  }

  return { name, parameters };
}

/**
 * Parse a Cursor agent transcript file
 */
export function parseTranscriptFile(filePath: string): CursorTranscript | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const messages: CursorMessage[] = [];

    // Split by role markers
    const sections = content.split(/^(user:|assistant:)\s*$/m);

    let currentRole: 'user' | 'assistant' | null = null;

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();

      if (section === 'user:') {
        currentRole = 'user';
        continue;
      } else if (section === 'assistant:') {
        currentRole = 'assistant';
        continue;
      }

      if (!currentRole || !section) continue;

      const message: CursorMessage = {
        role: currentRole,
        content: '',
      };

      if (currentRole === 'user') {
        // Extract user query from <user_query> tags
        const queryMatch = section.match(/<user_query>([\s\S]*?)<\/user_query>/);
        message.content = queryMatch ? queryMatch[1].trim() : section.trim();
      } else {
        // Parse assistant message
        let textContent = section;

        // Extract thinking blocks
        const thinkingMatch = section.match(/\[Thinking\]\s*([\s\S]*?)(?=\[Tool call\]|$)/);
        if (thinkingMatch) {
          message.thinking = thinkingMatch[1].trim();
          textContent = textContent.replace(/\[Thinking\][\s\S]*?(?=\[Tool call\]|$)/, '');
        }

        // Extract tool calls
        const toolCallMatches = section.matchAll(/(\[Tool call\][\s\S]*?)(?=\[Tool call\]|\[Tool result\]|$)/g);
        message.toolCalls = [];
        for (const match of toolCallMatches) {
          const toolCall = parseToolCall(match[1]);
          if (toolCall) {
            message.toolCalls.push(toolCall);
          }
          textContent = textContent.replace(match[1], '');
        }

        // Extract tool results
        const toolResultMatches = section.matchAll(/\[Tool result\]\s*(\w+)?\s*([\s\S]*?)(?=\[Tool call\]|\[Tool result\]|assistant:|user:|$)/g);
        message.toolResults = [];
        for (const match of toolResultMatches) {
          if (match[2]?.trim()) {
            message.toolResults.push(match[2].trim());
          }
          textContent = textContent.replace(match[0], '');
        }

        // Clean up remaining text content
        message.content = textContent
          .replace(/\[Thinking\]/g, '')
          .replace(/\[Tool call\]/g, '')
          .replace(/\[Tool result\]/g, '')
          .trim();
      }

      messages.push(message);
    }

    // Extract session ID from filename
    const fileName = path.basename(filePath, '.txt');

    // Extract project path from file path
    const pathParts = filePath.split('/');
    const projectsIdx = pathParts.indexOf('projects');
    let projectPath = '';
    if (projectsIdx !== -1) {
      projectPath = pathParts[projectsIdx + 1] || '';
    }

    const stats = fs.statSync(filePath);

    return {
      id: fileName,
      projectPath,
      messages,
      filePath,
      modifiedAt: stats.mtime,
    };
  } catch (error) {
    console.error(`Error parsing transcript ${filePath}:`, error);
    return null;
  }
}

/**
 * Find all transcript files in Cursor projects
 */
export function findCursorTranscripts(
  startDate?: Date,
  endDate?: Date
): string[] {
  const transcripts: string[] = [];

  if (!fs.existsSync(CURSOR_PROJECTS_DIR)) {
    return transcripts;
  }

  function walkDir(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (entry.name === 'agent-transcripts') {
            // Found transcripts directory, get all .txt files
            const txtFiles = fs.readdirSync(fullPath)
              .filter(f => f.endsWith('.txt'))
              .map(f => path.join(fullPath, f));

            for (const txtFile of txtFiles) {
              if (startDate || endDate) {
                const stats = fs.statSync(txtFile);
                if (startDate && stats.mtime < startDate) continue;
                if (endDate && stats.mtime > endDate) continue;
              }
              transcripts.push(txtFile);
            }
          } else {
            walkDir(fullPath);
          }
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  walkDir(CURSOR_PROJECTS_DIR);
  return transcripts;
}

/**
 * Parse all Cursor transcripts within a date range
 */
export function parseCursorTranscripts(
  startDate?: Date,
  endDate?: Date
): CursorTranscript[] {
  const files = findCursorTranscripts(startDate, endDate);
  const transcripts: CursorTranscript[] = [];

  for (const file of files) {
    const transcript = parseTranscriptFile(file);
    if (transcript) {
      transcripts.push(transcript);
    }
  }

  return transcripts;
}

/**
 * Convert CursorTranscript to ParsedCursorSession for unified analysis
 */
export function transcriptToSession(transcript: CursorTranscript): ParsedCursorSession {
  const userMessages = transcript.messages.filter(m => m.role === 'user');
  const toolCalls = transcript.messages
    .filter(m => m.role === 'assistant')
    .reduce((sum, m) => sum + (m.toolCalls?.length || 0), 0);

  return {
    sessionId: transcript.id,
    projectPath: transcript.projectPath,
    messages: transcript.messages,
    startTime: transcript.modifiedAt, // Approximate
    endTime: transcript.modifiedAt,
    toolCalls,
    userPrompts: userMessages.length,
  };
}

/**
 * Get stats from Cursor SQLite database
 */
export function getCursorDbStats(): CursorStats | null {
  if (!fs.existsSync(CURSOR_DB_PATH)) {
    return null;
  }

  try {
    const db = new Database(CURSOR_DB_PATH, { readonly: true });

    // Total code generations
    const countResult = db.prepare('SELECT COUNT(*) as count FROM ai_code_hashes').get() as { count: number };
    const totalCodeGenerations = countResult?.count || 0;

    // By model
    const byModel: Record<string, number> = {};
    const modelRows = db.prepare(
      'SELECT model, COUNT(*) as count FROM ai_code_hashes WHERE model IS NOT NULL GROUP BY model'
    ).all() as Array<{ model: string; count: number }>;
    for (const row of modelRows) {
      byModel[row.model] = row.count;
    }

    // By source
    const bySource: Record<string, number> = {};
    const sourceRows = db.prepare(
      'SELECT source, COUNT(*) as count FROM ai_code_hashes GROUP BY source'
    ).all() as Array<{ source: string; count: number }>;
    for (const row of sourceRows) {
      bySource[row.source] = row.count;
    }

    // By extension
    const byExtension: Record<string, number> = {};
    const extRows = db.prepare(
      'SELECT fileExtension, COUNT(*) as count FROM ai_code_hashes WHERE fileExtension IS NOT NULL GROUP BY fileExtension ORDER BY count DESC LIMIT 20'
    ).all() as Array<{ fileExtension: string; count: number }>;
    for (const row of extRows) {
      byExtension[row.fileExtension] = row.count;
    }

    // Conversation count
    const convResult = db.prepare(
      'SELECT COUNT(DISTINCT conversationId) as count FROM ai_code_hashes WHERE conversationId IS NOT NULL'
    ).get() as { count: number };
    const conversationCount = convResult?.count || 0;

    // Date range
    const dateResult = db.prepare(
      'SELECT MIN(createdAt) as earliest, MAX(createdAt) as latest FROM ai_code_hashes'
    ).get() as { earliest: number; latest: number };

    db.close();

    return {
      totalCodeGenerations,
      byModel,
      bySource,
      byExtension,
      conversationCount,
      dateRange: {
        earliest: new Date(dateResult?.earliest || Date.now()),
        latest: new Date(dateResult?.latest || Date.now()),
      },
    };
  } catch (error) {
    console.error('Error reading Cursor database:', error);
    return null;
  }
}

/**
 * Get user prompts from a Cursor transcript
 */
export function getCursorUserPrompts(transcript: CursorTranscript): CursorMessage[] {
  return transcript.messages.filter(m => m.role === 'user');
}

/**
 * Get tool usage stats from transcripts
 */
export function getCursorToolUsage(transcripts: CursorTranscript[]): Record<string, number> {
  const toolCounts: Record<string, number> = {};

  for (const transcript of transcripts) {
    for (const msg of transcript.messages) {
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (const tool of msg.toolCalls) {
          toolCounts[tool.name] = (toolCounts[tool.name] || 0) + 1;
        }
      }
    }
  }

  return toolCounts;
}
