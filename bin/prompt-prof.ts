#!/usr/bin/env node

import { Command } from 'commander';
import dayjs from 'dayjs';
import chalk from 'chalk';
import Table from 'cli-table3';
import {
  parseSessions,
  parseSessionFile,
  findSessionFiles,
} from '../src/parsers/session-parser';
import { parseStatsCache, calculateCacheHitRate } from '../src/parsers/stats-parser';
import {
  analyzeSessionPrompts,
  calculateAverageQuality,
} from '../src/analyzers/prompt-quality';
import { analyzeSessionCost, analyzeMultiSessionCost } from '../src/analyzers/cost';
import {
  analyzeMultiSessionEfficiency,
} from '../src/analyzers/efficiency';
import { analyzePatterns } from '../src/analyzers/patterns';
import {
  printHeader,
  printDailyReport,
  printCostSummary,
  printEfficiencyMetrics,
  printPatternAnalysis,
  printBestPrompts,
  printWorstPrompts,
  printPromptAnalysis,
  printSessionSummary,
  printError,
  printInfo,
  printNoData,
  printSection,
} from '../src/reporters/cli-reporter';
import { DailyReport, ParsedSession } from '../src/types/claude-data';
import { CLAUDE_DATA_DIR } from '../src/core/constants';

// Cursor imports
import {
  parseCursorTranscripts,
  parseTranscriptFile,
  findCursorTranscripts,
  getCursorDbStats,
  getCursorToolUsage,
} from '../src/parsers/cursor-parser';
import {
  analyzeCursorTranscriptPrompts,
  calculateCursorAverageQuality,
  getCursorBestPrompts,
  getCursorWorstPrompts,
  detectCursorRetries,
} from '../src/analyzers/cursor-quality';
import { CURSOR_DATA_DIR } from '../src/types/cursor-data';
import {
  classifyPrompt,
  classifyPromptWithResponse,
  calculatePromptStats,
  ClassifiedPrompt,
  PromptStats,
  getTypeLabel,
} from '../src/analyzers/prompt-classifier';

import * as fs from 'fs';

const program = new Command();

program
  .name('prompt-prof')
  .description('AI Coding Assistant Prompt Effectiveness Analyzer (Claude Code & Cursor)')
  .version('1.0.0');

// ==================== CLAUDE CODE COMMANDS ====================

const claudeCmd = program.command('claude').description('Claude Code analysis commands');

// Claude Report commands
const claudeReportCmd = claudeCmd.command('report').description('Generate Claude Code usage reports');

claudeReportCmd
  .command('daily')
  .description('Generate today\'s usage report')
  .option('-d, --date <date>', 'Specific date (YYYY-MM-DD)')
  .action(async (options) => {
    try {
      const targetDate = options.date ? dayjs(options.date) : dayjs();
      const startOfDay = targetDate.startOf('day').toDate();
      const endOfDay = targetDate.endOf('day').toDate();

      const sessions = await parseSessions(startOfDay, endOfDay);

      if (sessions.length === 0) {
        printNoData(`No Claude Code sessions found for ${targetDate.format('YYYY-MM-DD')}`);
        return;
      }

      const report = await generateClaudeDailyReport(sessions, targetDate.toDate());
      printDailyReport(report);
    } catch (err) {
      printError(err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

claudeReportCmd
  .command('weekly')
  .description('Generate this week\'s usage report')
  .action(async () => {
    try {
      const endOfToday = dayjs().endOf('day').toDate();
      const startOfWeek = dayjs().subtract(7, 'day').startOf('day').toDate();

      const sessions = await parseSessions(startOfWeek, endOfToday);

      if (sessions.length === 0) {
        printNoData('No Claude Code sessions found for the past week');
        return;
      }

      printHeader(`Claude Code Weekly Report: ${dayjs(startOfWeek).format('MMM D')} - ${dayjs().format('MMM D, YYYY')}`);

      const totalPrompts = sessions.reduce(
        (sum, s) => sum + s.messages.filter(m => m.role === 'user').length,
        0
      );
      const costAnalysis = analyzeMultiSessionCost(sessions);
      const efficiency = analyzeMultiSessionEfficiency(sessions);
      const patterns = analyzePatterns(sessions);

      console.log();
      console.log(`Sessions: ${sessions.length}`);
      console.log(`Total Prompts: ${totalPrompts}`);
      console.log(`Total Cost: $${costAnalysis.totalCostUSD.toFixed(2)}`);
      console.log();

      printEfficiencyMetrics(efficiency);
      printPatternAnalysis(patterns);
      printCostSummary(costAnalysis, 'Weekly Cost Breakdown');
    } catch (err) {
      printError(err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

// Claude Patterns commands
const claudePatternsCmd = claudeCmd.command('patterns').description('Analyze Claude Code prompt patterns');

claudePatternsCmd
  .command('best')
  .description('Show top prompts by quality score')
  .option('-n, --count <number>', 'Number of prompts to show', '10')
  .option('-d, --days <number>', 'Days to look back', '7')
  .action(async (options) => {
    try {
      const days = parseInt(options.days);
      const count = parseInt(options.count);
      const endDate = dayjs().endOf('day').toDate();
      const startDate = dayjs().subtract(days, 'day').startOf('day').toDate();

      const sessions = await parseSessions(startDate, endDate);

      if (sessions.length === 0) {
        printNoData(`No Claude Code sessions found in the past ${days} days`);
        return;
      }

      const patterns = analyzePatterns(sessions);
      printBestPrompts(patterns.bestPrompts.slice(0, count), `TOP ${count} CLAUDE CODE PROMPTS (Past ${days} days)`);
    } catch (err) {
      printError(err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

claudePatternsCmd
  .command('worst')
  .description('Show bottom prompts by quality score')
  .option('-n, --count <number>', 'Number of prompts to show', '10')
  .option('-d, --days <number>', 'Days to look back', '7')
  .action(async (options) => {
    try {
      const days = parseInt(options.days);
      const count = parseInt(options.count);
      const endDate = dayjs().endOf('day').toDate();
      const startDate = dayjs().subtract(days, 'day').startOf('day').toDate();

      const sessions = await parseSessions(startDate, endDate);

      if (sessions.length === 0) {
        printNoData(`No Claude Code sessions found in the past ${days} days`);
        return;
      }

      const patterns = analyzePatterns(sessions);
      printWorstPrompts(patterns.worstPrompts.slice(0, count), `BOTTOM ${count} CLAUDE CODE PROMPTS (Past ${days} days)`);
    } catch (err) {
      printError(err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

// Claude Cost commands
const claudeCostCmd = claudeCmd.command('cost').description('Claude Code cost analysis');

claudeCostCmd
  .command('summary')
  .description('Show cost breakdown')
  .option('-d, --days <number>', 'Days to look back', '7')
  .action(async (options) => {
    try {
      const days = parseInt(options.days);
      const endDate = dayjs().endOf('day').toDate();
      const startDate = dayjs().subtract(days, 'day').startOf('day').toDate();

      const sessions = await parseSessions(startDate, endDate);

      if (sessions.length === 0) {
        printNoData(`No Claude Code sessions found in the past ${days} days`);
        return;
      }

      const analysis = analyzeMultiSessionCost(sessions);
      printCostSummary(analysis, `Claude Code Cost Summary (Past ${days} days)`);
    } catch (err) {
      printError(err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

// Claude List commands
const claudeListCmd = claudeCmd.command('list').description('List Claude Code sessions');

claudeListCmd
  .command('sessions')
  .description('List recent sessions')
  .option('-n, --count <number>', 'Number of sessions to show', '10')
  .action(async (options) => {
    try {
      const count = parseInt(options.count);
      const files = await findSessionFiles();

      if (files.length === 0) {
        printNoData('No Claude Code sessions found');
        return;
      }

      const recentFiles = files
        .map(f => ({
          path: f,
          mtime: fs.statSync(f).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
        .slice(0, count);

      printHeader('Recent Claude Code Sessions');
      console.log();

      for (const file of recentFiles) {
        const session = await parseSessionFile(file.path);
        if (session) {
          const duration = dayjs(session.endTime).diff(dayjs(session.startTime), 'minute');
          const durationStr = duration > 60 ? `${Math.floor(duration / 60)}h ${duration % 60}m` : `${duration}m`;
          const analyzed = analyzeSessionPrompts(session);
          const avgScore = calculateAverageQuality(analyzed);

          printSessionSummary(
            session.sessionId,
            session.messages.filter(m => m.role === 'user').length,
            session.totalCostUSD,
            avgScore,
            durationStr
          );
        }
      }
      console.log();
    } catch (err) {
      printError(err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

// Claude Analyze command
claudeCmd
  .command('analyze <sessionId>')
  .description('Analyze a specific Claude Code session')
  .action(async (sessionId: string) => {
    try {
      const allFiles = await findSessionFiles();
      const sessionFile = allFiles.find(f => f.includes(sessionId));

      if (!sessionFile) {
        printError(`Session not found: ${sessionId}`);
        printInfo('Use "prompt-prof claude list sessions" to see available sessions');
        process.exit(1);
      }

      const session = await parseSessionFile(sessionFile);
      if (!session) {
        printError('Failed to parse session');
        process.exit(1);
      }

      printHeader(`Claude Code Session: ${sessionId.slice(0, 8)}...`);

      console.log();
      console.log(`Project: ${session.projectPath || 'Unknown'}`);
      console.log(`Started: ${dayjs(session.startTime).format('YYYY-MM-DD HH:mm')}`);
      console.log(`Ended: ${dayjs(session.endTime).format('YYYY-MM-DD HH:mm')}`);
      console.log(`Messages: ${session.messages.length}`);
      console.log();

      const analyzed = analyzeSessionPrompts(session);
      const avgScore = calculateAverageQuality(analyzed);

      console.log(`Average Quality Score: ${avgScore}/100`);
      console.log();

      for (const p of analyzed) {
        printPromptAnalysis(p.prompt, p.score);
      }

      const cost = analyzeSessionCost(session);
      printCostSummary(cost, 'Session Cost');
    } catch (err) {
      printError(err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

// ==================== CURSOR COMMANDS ====================

const cursorCmd = program.command('cursor').description('Cursor agent analysis commands');

// Cursor Report commands
const cursorReportCmd = cursorCmd.command('report').description('Generate Cursor usage reports');

cursorReportCmd
  .command('summary')
  .description('Generate Cursor usage summary')
  .option('-d, --days <number>', 'Days to look back', '7')
  .action(async (options) => {
    try {
      const days = parseInt(options.days);
      const endDate = dayjs().endOf('day').toDate();
      const startDate = dayjs().subtract(days, 'day').startOf('day').toDate();

      const transcripts = parseCursorTranscripts(startDate, endDate);

      if (transcripts.length === 0) {
        printNoData(`No Cursor transcripts found in the past ${days} days`);
        return;
      }

      printHeader(`Cursor Agent Report (Past ${days} days)`);

      // Analyze all transcripts
      let totalPrompts = 0;
      let totalToolCalls = 0;
      let totalRetries = 0;
      const allAnalyzed: Array<{ prompt: string; score: { overall: number; issues: string[] } }> = [];

      for (const transcript of transcripts) {
        const userMsgs = transcript.messages.filter(m => m.role === 'user');
        totalPrompts += userMsgs.length;

        for (const msg of transcript.messages) {
          if (msg.role === 'assistant' && msg.toolCalls) {
            totalToolCalls += msg.toolCalls.length;
          }
        }

        const retries = detectCursorRetries(transcript);
        totalRetries += retries.count;

        const analyzed = analyzeCursorTranscriptPrompts(transcript);
        for (const p of analyzed) {
          allAnalyzed.push({
            prompt: p.prompt,
            score: {
              overall: p.score.overall,
              issues: p.score.issues,
            },
          });
        }
      }

      const avgScore = allAnalyzed.length > 0
        ? Math.round(allAnalyzed.reduce((sum, p) => sum + p.score.overall, 0) / allAnalyzed.length)
        : 0;

      const retryRate = totalPrompts > 0 ? (totalRetries / totalPrompts) * 100 : 0;

      console.log();
      console.log(`Transcripts: ${transcripts.length}`);
      console.log(`Total Prompts: ${totalPrompts}`);
      console.log(`Tool Calls: ${totalToolCalls}`);
      console.log();

      printSection('METRICS', '📊');

      const metricsTable = new Table({
        head: [chalk.cyan('Metric'), chalk.cyan('Value'), chalk.cyan('Status')],
        style: { head: [], border: [] },
      });

      const qualityStatus = avgScore >= 70
        ? chalk.green('↑ Good')
        : avgScore >= 50
          ? chalk.yellow('→ Fair')
          : chalk.red('↓ Poor');

      metricsTable.push(
        ['Avg Quality', `${avgScore}/100`, qualityStatus],
        ['Retry Rate', `${retryRate.toFixed(1)}%`, retryRate <= 10 ? chalk.green('✓') : chalk.red('!')],
        ['Tool Calls/Prompt', `${(totalToolCalls / Math.max(totalPrompts, 1)).toFixed(1)}`, chalk.blue('○')],
      );

      console.log(metricsTable.toString());

      // Tool usage breakdown
      const toolUsage = getCursorToolUsage(transcripts);
      if (Object.keys(toolUsage).length > 0) {
        printSection('TOOL USAGE', '🛠️');

        const toolTable = new Table({
          head: [chalk.cyan('Tool'), chalk.cyan('Uses')],
          style: { head: [], border: [] },
        });

        const sortedTools = Object.entries(toolUsage)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);

        for (const [name, count] of sortedTools) {
          toolTable.push([name, count.toString()]);
        }

        console.log(toolTable.toString());
      }

      // Best/worst prompts
      const sortedPrompts = [...allAnalyzed].sort((a, b) => b.score.overall - a.score.overall);

      if (sortedPrompts.length > 0) {
        printSection('TOP PROMPTS', '🏆');
        for (let i = 0; i < Math.min(3, sortedPrompts.length); i++) {
          const p = sortedPrompts[i];
          const truncated = p.prompt.length > 50 ? p.prompt.slice(0, 47) + '...' : p.prompt;
          console.log(
            chalk.white(`${i + 1}. `) +
            chalk.green(`"${truncated}"`) +
            chalk.gray(` (Score: ${p.score.overall})`)
          );
        }

        printSection('NEEDS IMPROVEMENT', '⚠️');
        const worst = sortedPrompts.slice(-3).reverse();
        for (let i = 0; i < worst.length; i++) {
          const p = worst[i];
          const truncated = p.prompt.length > 40 ? p.prompt.slice(0, 37) + '...' : p.prompt;
          const issue = p.score.issues[0] || 'Low score';
          console.log(
            chalk.white(`${i + 1}. `) +
            chalk.red(`"${truncated}"`) +
            chalk.gray(` (Score: ${p.score.overall})`) +
            chalk.yellow(` - ${issue}`)
          );
        }
      }

      console.log();
    } catch (err) {
      printError(err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

// Cursor Patterns commands
const cursorPatternsCmd = cursorCmd.command('patterns').description('Analyze Cursor prompt patterns');

cursorPatternsCmd
  .command('best')
  .description('Show top prompts by quality score')
  .option('-n, --count <number>', 'Number of prompts to show', '10')
  .option('-d, --days <number>', 'Days to look back', '30')
  .action(async (options) => {
    try {
      const days = parseInt(options.days);
      const count = parseInt(options.count);
      const endDate = dayjs().endOf('day').toDate();
      const startDate = dayjs().subtract(days, 'day').startOf('day').toDate();

      const transcripts = parseCursorTranscripts(startDate, endDate);

      if (transcripts.length === 0) {
        printNoData(`No Cursor transcripts found in the past ${days} days`);
        return;
      }

      const allAnalyzed: Array<{ prompt: string; score: { overall: number; issues: string[] } }> = [];

      for (const transcript of transcripts) {
        const analyzed = analyzeCursorTranscriptPrompts(transcript);
        for (const p of analyzed) {
          allAnalyzed.push({
            prompt: p.prompt,
            score: {
              overall: p.score.overall,
              issues: p.score.issues,
            },
          });
        }
      }

      const best = getCursorBestPrompts(
        allAnalyzed.map(p => ({ prompt: p.prompt, score: { overall: p.score.overall, clarity: 0, context: 0, efficiency: 0, outcome: 0, issues: p.score.issues, suggestions: [] } })),
        count
      );

      printBestPrompts(
        best.map(p => ({ prompt: p.prompt, score: p.score, uuid: '' })),
        `TOP ${count} CURSOR PROMPTS (Past ${days} days)`
      );
    } catch (err) {
      printError(err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

cursorPatternsCmd
  .command('worst')
  .description('Show bottom prompts by quality score')
  .option('-n, --count <number>', 'Number of prompts to show', '10')
  .option('-d, --days <number>', 'Days to look back', '30')
  .action(async (options) => {
    try {
      const days = parseInt(options.days);
      const count = parseInt(options.count);
      const endDate = dayjs().endOf('day').toDate();
      const startDate = dayjs().subtract(days, 'day').startOf('day').toDate();

      const transcripts = parseCursorTranscripts(startDate, endDate);

      if (transcripts.length === 0) {
        printNoData(`No Cursor transcripts found in the past ${days} days`);
        return;
      }

      const allAnalyzed: Array<{ prompt: string; score: { overall: number; issues: string[] } }> = [];

      for (const transcript of transcripts) {
        const analyzed = analyzeCursorTranscriptPrompts(transcript);
        for (const p of analyzed) {
          allAnalyzed.push({
            prompt: p.prompt,
            score: {
              overall: p.score.overall,
              issues: p.score.issues,
            },
          });
        }
      }

      const worst = getCursorWorstPrompts(
        allAnalyzed.map(p => ({ prompt: p.prompt, score: { overall: p.score.overall, clarity: 0, context: 0, efficiency: 0, outcome: 0, issues: p.score.issues, suggestions: [] } })),
        count
      );

      printWorstPrompts(
        worst.map(p => ({ prompt: p.prompt, score: p.score, uuid: '', issues: p.issues })),
        `BOTTOM ${count} CURSOR PROMPTS (Past ${days} days)`
      );
    } catch (err) {
      printError(err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

// Cursor List commands
const cursorListCmd = cursorCmd.command('list').description('List Cursor transcripts');

cursorListCmd
  .command('transcripts')
  .description('List recent transcripts')
  .option('-n, --count <number>', 'Number to show', '10')
  .action(async (options) => {
    try {
      const count = parseInt(options.count);
      const files = findCursorTranscripts();

      if (files.length === 0) {
        printNoData('No Cursor transcripts found');
        return;
      }

      const recentFiles = files
        .map(f => ({
          path: f,
          mtime: fs.statSync(f).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
        .slice(0, count);

      printHeader('Recent Cursor Transcripts');
      console.log();

      for (const file of recentFiles) {
        const transcript = parseTranscriptFile(file.path);
        if (transcript) {
          const userMsgs = transcript.messages.filter(m => m.role === 'user');
          const analyzed = analyzeCursorTranscriptPrompts(transcript);
          const avgScore = calculateCursorAverageQuality(analyzed);

          console.log(chalk.gray('─'.repeat(52)));
          console.log(chalk.white(`Transcript: ${chalk.cyan(transcript.id.slice(0, 8))}...`));
          console.log(
            chalk.gray('Project: ') + chalk.white(transcript.projectPath.replace('Users-sanketagarwal-Documents-', '')) +
            chalk.gray(' | Prompts: ') + chalk.white(userMsgs.length) +
            chalk.gray(' | Avg Score: ') + chalk.white(`${avgScore}/100`)
          );
          console.log(chalk.gray(`Modified: ${dayjs(transcript.modifiedAt).format('YYYY-MM-DD HH:mm')}`));
        }
      }
      console.log();
    } catch (err) {
      printError(err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

// Cursor Analyze command
cursorCmd
  .command('analyze <transcriptId>')
  .description('Analyze a specific Cursor transcript')
  .action(async (transcriptId: string) => {
    try {
      const allFiles = findCursorTranscripts();
      const transcriptFile = allFiles.find(f => f.includes(transcriptId));

      if (!transcriptFile) {
        printError(`Transcript not found: ${transcriptId}`);
        printInfo('Use "prompt-prof cursor list transcripts" to see available transcripts');
        process.exit(1);
      }

      const transcript = parseTranscriptFile(transcriptFile);
      if (!transcript) {
        printError('Failed to parse transcript');
        process.exit(1);
      }

      printHeader(`Cursor Transcript: ${transcriptId.slice(0, 8)}...`);

      console.log();
      console.log(`Project: ${transcript.projectPath}`);
      console.log(`Modified: ${dayjs(transcript.modifiedAt).format('YYYY-MM-DD HH:mm')}`);
      console.log(`Messages: ${transcript.messages.length}`);
      console.log();

      const analyzed = analyzeCursorTranscriptPrompts(transcript);
      const avgScore = calculateCursorAverageQuality(analyzed);

      console.log(`Average Quality Score: ${avgScore}/100`);
      console.log();

      for (const p of analyzed) {
        printPromptAnalysis(p.prompt, p.score);
      }
    } catch (err) {
      printError(err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

// Cursor Stats command
cursorCmd
  .command('stats')
  .description('Show Cursor database stats')
  .action(() => {
    const stats = getCursorDbStats();

    if (!stats) {
      printInfo('Cursor database not found or empty');
      return;
    }

    printHeader('Cursor Database Stats');
    console.log();

    console.log(`Total Code Generations: ${stats.totalCodeGenerations.toLocaleString()}`);
    console.log(`Conversations: ${stats.conversationCount.toLocaleString()}`);
    console.log(`Date Range: ${dayjs(stats.dateRange.earliest).format('YYYY-MM-DD')} to ${dayjs(stats.dateRange.latest).format('YYYY-MM-DD')}`);
    console.log();

    if (Object.keys(stats.byModel).length > 0) {
      printSection('BY MODEL', '🤖');
      for (const [model, count] of Object.entries(stats.byModel).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${model || 'unknown'}: ${count.toLocaleString()}`);
      }
    }

    if (Object.keys(stats.bySource).length > 0) {
      printSection('BY SOURCE', '📝');
      for (const [source, count] of Object.entries(stats.bySource).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${source}: ${count.toLocaleString()}`);
      }
    }

    if (Object.keys(stats.byExtension).length > 0) {
      printSection('TOP FILE TYPES', '📄');
      const topExt = Object.entries(stats.byExtension).sort((a, b) => b[1] - a[1]).slice(0, 10);
      for (const [ext, count] of topExt) {
        console.log(`  .${ext}: ${count.toLocaleString()}`);
      }
    }

    console.log();
  });

// ==================== GLOBAL REPORT COMMAND ====================

// Extended interface for combined prompts with source tracking
interface CombinedPrompt extends ClassifiedPrompt {
  source: 'Claude Code' | 'Cursor';
  issues?: string[];
}

// Suggestion generator for low-scoring prompts
function getSuggestion(prompt: string, issues: string[]): string {
  if (issues.length > 0) {
    return issues[0];
  }

  const trimmed = prompt.trim().toLowerCase();

  if (trimmed.length < 10) {
    return 'Add more context and specifics';
  }
  if (trimmed.includes('fix it') || trimmed.includes('make it work')) {
    return 'Be specific: what exactly needs fixing?';
  }
  if (trimmed.includes('do the same') || trimmed.includes('same thing')) {
    return 'Reference the specific action/file explicitly';
  }
  if (!trimmed.includes('.') && !trimmed.includes('/') && trimmed.length < 30) {
    return 'Include file names or paths for clarity';
  }
  if (trimmed.startsWith('no') || trimmed.startsWith('not') || trimmed.startsWith('wrong')) {
    return 'Provide complete requirements instead of corrections';
  }

  return 'Add more context about the desired outcome';
}

program
  .command('report')
  .description('Comprehensive combined report for all AI assistants')
  .option('-d, --days <number>', 'Days to look back', '7')
  .action(async (options) => {
    try {
      const days = parseInt(options.days);
      const endDate = dayjs().endOf('day').toDate();
      const startDate = dayjs().subtract(days, 'day').startOf('day').toDate();

      printHeader(`Prompt Effectiveness Report (Past ${days} days)`);
      console.log();

      // Collect ALL prompts from both sources
      const allPrompts: CombinedPrompt[] = [];
      let claudeSessions = 0;
      let cursorTranscripts = 0;

      // ===== COLLECT CLAUDE CODE PROMPTS =====
      if (fs.existsSync(CLAUDE_DATA_DIR)) {
        const sessions = await parseSessions(startDate, endDate);
        claudeSessions = sessions.length;

        for (const session of sessions) {
          const analyzed = analyzeSessionPrompts(session);
          const messages = session.messages;

          for (const p of analyzed) {
            const msgIndex = messages.findIndex(m => m.uuid === p.uuid);
            const response = messages.slice(msgIndex + 1).find(m => m.role === 'assistant') || null;
            const type = classifyPromptWithResponse(p.prompt, response);

            if (p.prompt.trim().length > 0) {
              allPrompts.push({
                prompt: p.prompt,
                type,
                score: p.score.overall,
                source: 'Claude Code',
                issues: p.score.issues,
              });
            }
          }
        }
      }

      // ===== COLLECT CURSOR PROMPTS =====
      if (fs.existsSync(CURSOR_DATA_DIR)) {
        const transcripts = parseCursorTranscripts(startDate, endDate);
        cursorTranscripts = transcripts.length;

        for (const transcript of transcripts) {
          const analyzed = analyzeCursorTranscriptPrompts(transcript);
          const messages = transcript.messages;

          for (const p of analyzed) {
            const msgIndex = messages.findIndex(m => m.role === 'user' && m.content === p.prompt);
            const response = messages.slice(msgIndex + 1).find(m => m.role === 'assistant') || null;
            const type = classifyPromptWithResponse(p.prompt, response);

            if (p.prompt.trim().length > 0) {
              allPrompts.push({
                prompt: p.prompt,
                type,
                score: p.score.overall,
                source: 'Cursor',
                issues: p.score.issues,
              });
            }
          }
        }
      }

      if (allPrompts.length === 0) {
        printNoData(`No prompts found in the past ${days} days`);
        return;
      }

      // Calculate combined statistics
      const stats = calculatePromptStats(allPrompts);

      // ===== SUMMARY SECTION =====
      printSection('COMBINED SUMMARY', '📊');
      console.log();

      const summaryTable = new Table({
        style: { head: [], border: [] },
      });

      summaryTable.push(
        [chalk.gray('Total Prompts'), chalk.white(stats.total.toString())],
        [chalk.gray('Average Score'), getScoreColor(stats.avgScore)(`${stats.avgScore}/100`)],
        [chalk.gray('Claude Code Sessions'), chalk.white(claudeSessions.toString())],
        [chalk.gray('Cursor Transcripts'), chalk.white(cursorTranscripts.toString())],
      );

      console.log(summaryTable.toString());
      console.log();

      // ===== PROMPT TYPE BREAKDOWN =====
      console.log(chalk.cyan('Prompt Types:'));
      const typeTable = new Table({
        head: [chalk.cyan('Type'), chalk.cyan('Count'), chalk.cyan('%')],
        style: { head: [], border: [] },
      });

      const allTypes: Array<[string, number]> = [
        ['Code Generation', stats.codeGeneration],
        ['Questions', stats.questions],
        ['File Operations', stats.fileOperations],
        ['Commands/Actions', stats.commands],
        ['Clarifications', stats.clarifications],
        ['Other', stats.other],
      ];

      for (const [label, count] of allTypes) {
        if (count > 0) {
          const pct = stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : '0';
          typeTable.push([label, count.toString(), `${pct}%`]);
        }
      }

      console.log(typeTable.toString());
      console.log();

      // ===== SCORE DISTRIBUTION =====
      console.log(chalk.cyan('Score Distribution:'));
      const distTable = new Table({
        head: [chalk.cyan('Rating'), chalk.cyan('Count'), chalk.cyan('%')],
        style: { head: [], border: [] },
      });

      const totalForPct = stats.total || 1;
      distTable.push(
        [chalk.green('Excellent (90+)'), stats.scoreDistribution.excellent.toString(), `${((stats.scoreDistribution.excellent / totalForPct) * 100).toFixed(1)}%`],
        [chalk.blue('Good (70-89)'), stats.scoreDistribution.good.toString(), `${((stats.scoreDistribution.good / totalForPct) * 100).toFixed(1)}%`],
        [chalk.yellow('Fair (50-69)'), stats.scoreDistribution.fair.toString(), `${((stats.scoreDistribution.fair / totalForPct) * 100).toFixed(1)}%`],
        [chalk.red('Poor (<50)'), stats.scoreDistribution.poor.toString(), `${((stats.scoreDistribution.poor / totalForPct) * 100).toFixed(1)}%`],
      );

      console.log(distTable.toString());
      console.log();

      // ===== TOP 5 BEST PROMPTS =====
      const sortedPrompts = [...allPrompts].sort((a, b) => b.score - a.score);
      const best = sortedPrompts.slice(0, 5);

      printSection('TOP 5 BEST PROMPTS', '🏆');
      console.log();

      for (let i = 0; i < best.length; i++) {
        const p = best[i];
        const truncated = p.prompt.length > 60 ? p.prompt.slice(0, 57) + '...' : p.prompt;
        const sourceLabel = p.source === 'Claude Code' ? chalk.magenta('[CC]') : chalk.cyan('[Cu]');
        console.log(
          chalk.white(`${i + 1}. `) +
          sourceLabel + ' ' +
          chalk.green(`"${truncated}"`) +
          chalk.gray(` (Score: ${p.score})`)
        );
      }
      console.log();

      // ===== TOP 5 WORST PROMPTS WITH SUGGESTIONS =====
      const worst = sortedPrompts.slice(-5).reverse();

      printSection('TOP 5 WORST PROMPTS (with suggestions)', '⚠️');
      console.log();

      for (let i = 0; i < worst.length; i++) {
        const p = worst[i];
        const truncated = p.prompt.length > 50 ? p.prompt.slice(0, 47) + '...' : p.prompt;
        const sourceLabel = p.source === 'Claude Code' ? chalk.magenta('[CC]') : chalk.cyan('[Cu]');
        const suggestion = getSuggestion(p.prompt, p.issues || []);
        console.log(
          chalk.white(`${i + 1}. `) +
          sourceLabel + ' ' +
          chalk.red(`"${truncated}"`) +
          chalk.gray(` (Score: ${p.score})`)
        );
        console.log(
          chalk.gray('   → ') + chalk.yellow(suggestion)
        );
      }
      console.log();

      // ===== SOURCE BREAKDOWN =====
      const claudeCount = allPrompts.filter(p => p.source === 'Claude Code').length;
      const cursorCount = allPrompts.filter(p => p.source === 'Cursor').length;
      const claudeAvg = claudeCount > 0
        ? Math.round(allPrompts.filter(p => p.source === 'Claude Code').reduce((sum, p) => sum + p.score, 0) / claudeCount)
        : 0;
      const cursorAvg = cursorCount > 0
        ? Math.round(allPrompts.filter(p => p.source === 'Cursor').reduce((sum, p) => sum + p.score, 0) / cursorCount)
        : 0;

      printSection('BY SOURCE', '📈');
      console.log();

      const sourceTable = new Table({
        head: [chalk.cyan('Source'), chalk.cyan('Prompts'), chalk.cyan('Avg Score')],
        style: { head: [], border: [] },
      });

      if (claudeCount > 0) {
        sourceTable.push([chalk.magenta('Claude Code'), claudeCount.toString(), getScoreColor(claudeAvg)(`${claudeAvg}/100`)]);
      }
      if (cursorCount > 0) {
        sourceTable.push([chalk.cyan('Cursor'), cursorCount.toString(), getScoreColor(cursorAvg)(`${cursorAvg}/100`)]);
      }

      console.log(sourceTable.toString());
      console.log();

      // Legend
      console.log(chalk.gray('Legend: [CC] = Claude Code, [Cu] = Cursor'));
      console.log(chalk.gray('For detailed reports: prompt-prof claude report daily | prompt-prof cursor report summary'));
      console.log();
    } catch (err) {
      printError(err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

// Helper function for score coloring
function getScoreColor(score: number): (text: string) => string {
  if (score >= 90) return chalk.green;
  if (score >= 70) return chalk.blue;
  if (score >= 50) return chalk.yellow;
  return chalk.red;
}

// ==================== GLOBAL STATS COMMAND ====================

program
  .command('stats')
  .description('Show quick stats for all sources')
  .action(() => {
    let hasData = false;

    // Claude Code stats
    if (fs.existsSync(CLAUDE_DATA_DIR)) {
      const stats = parseStatsCache();
      if (stats) {
        hasData = true;
        printHeader('Claude Code Stats');
        console.log();

        if (stats.totalCost !== undefined) {
          console.log(`Total Cost: $${stats.totalCost.toFixed(2)}`);
        }
        if (stats.sessions !== undefined) {
          console.log(`Sessions: ${stats.sessions}`);
        }
        if (stats.totalTokens) {
          console.log(`Input Tokens: ${stats.totalTokens.input?.toLocaleString() || 0}`);
          console.log(`Output Tokens: ${stats.totalTokens.output?.toLocaleString() || 0}`);
          console.log(`Cache Hit Rate: ${calculateCacheHitRate(stats).toFixed(1)}%`);
        }
        console.log();
      }
    }

    // Cursor stats
    if (fs.existsSync(CURSOR_DATA_DIR)) {
      const cursorStats = getCursorDbStats();
      if (cursorStats) {
        hasData = true;
        printHeader('Cursor Stats');
        console.log();
        console.log(`Code Generations: ${cursorStats.totalCodeGenerations.toLocaleString()}`);
        console.log(`Conversations: ${cursorStats.conversationCount.toLocaleString()}`);
        console.log();
      }
    }

    if (!hasData) {
      printInfo('No data found. Make sure Claude Code or Cursor has been used.');
    }
  });

// Helper function to generate Claude daily report
async function generateClaudeDailyReport(sessions: ParsedSession[], date: Date): Promise<DailyReport> {
  const allAnalyzed: Array<{ prompt: string; score: { overall: number; issues: string[] } }> = [];

  for (const session of sessions) {
    const analyzed = analyzeSessionPrompts(session);
    for (const p of analyzed) {
      allAnalyzed.push({
        prompt: p.prompt,
        score: {
          overall: p.score.overall,
          issues: p.score.issues,
        },
      });
    }
  }

  const totalPrompts = allAnalyzed.length;
  const avgScore = totalPrompts > 0
    ? Math.round(allAnalyzed.reduce((sum, p) => sum + p.score.overall, 0) / totalPrompts)
    : 0;

  const costAnalysis = analyzeMultiSessionCost(sessions);
  const efficiency = analyzeMultiSessionEfficiency(sessions);
  const patterns = analyzePatterns(sessions);

  const sortedPrompts = [...allAnalyzed].sort((a, b) => b.score.overall - a.score.overall);

  return {
    date,
    sessions: sessions.length,
    prompts: totalPrompts,
    totalCostUSD: costAnalysis.totalCostUSD,
    avgQualityScore: avgScore,
    cacheHitRate: efficiency.cacheHitRate,
    retryRate: patterns.retryRate,
    toolSuccessRate: patterns.toolSuccessRate,
    topPrompts: sortedPrompts.slice(0, 5).map(p => ({
      prompt: p.prompt,
      score: p.score.overall,
    })),
    worstPrompts: sortedPrompts.slice(-5).reverse().map(p => ({
      prompt: p.prompt,
      score: p.score.overall,
      issues: p.score.issues,
    })),
  };
}

// Check for at least one data source
const hasClaudeData = fs.existsSync(CLAUDE_DATA_DIR);
const hasCursorData = fs.existsSync(CURSOR_DATA_DIR);

if (!hasClaudeData && !hasCursorData) {
  printError('No AI coding assistant data found');
  printInfo('Make sure Claude Code (~/.claude) or Cursor (~/.cursor) has been used.');
  process.exit(1);
}

program.parse();
