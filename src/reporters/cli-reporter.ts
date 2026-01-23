import chalk from 'chalk';
import Table from 'cli-table3';
import dayjs from 'dayjs';
import { DailyReport, CostAnalysis, PatternAnalysis, PromptQualityScore } from '../types/claude-data';
import { EfficiencyMetrics, getEfficiencyRating, formatDuration } from '../analyzers/efficiency';
import { formatCost, getCostBreakdown } from '../analyzers/cost';
import { getQualityRating } from '../analyzers/prompt-quality';

/**
 * Print a header box
 */
export function printHeader(title: string): void {
  const width = 52;
  const padding = Math.floor((width - title.length - 2) / 2);
  const padLeft = ' '.repeat(padding);
  const padRight = ' '.repeat(width - title.length - padding - 2);

  console.log(chalk.cyan('╔' + '═'.repeat(width) + '╗'));
  console.log(chalk.cyan('║') + padLeft + chalk.bold.white(title) + padRight + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(width) + '╝'));
}

/**
 * Print a section header
 */
export function printSection(title: string, emoji: string = ''): void {
  console.log();
  console.log(chalk.bold.yellow(`${emoji} ${title}`));
}

/**
 * Print the daily report
 */
export function printDailyReport(report: DailyReport): void {
  const dateStr = dayjs(report.date).format('MMMM D, YYYY');
  printHeader(`Daily Report: ${dateStr}`);

  // Summary line
  console.log(chalk.cyan('╠' + '═'.repeat(52) + '╣'));
  const summaryLine = `Sessions: ${report.sessions}    Prompts: ${report.prompts}    Cost: ${formatCost(report.totalCostUSD)}`;
  const summaryPad = Math.floor((52 - summaryLine.length) / 2);
  console.log(
    chalk.cyan('║') +
    ' '.repeat(summaryPad) +
    chalk.white(summaryLine) +
    ' '.repeat(52 - summaryLine.length - summaryPad) +
    chalk.cyan('║')
  );
  console.log(chalk.cyan('╠' + '═'.repeat(52) + '╣'));

  // Metrics table
  printSection('METRICS', '📊');

  const metricsTable = new Table({
    head: [
      chalk.cyan('Metric'),
      chalk.cyan('Value'),
      chalk.cyan('Status'),
    ],
    style: { head: [], border: [] },
  });

  // Quality score
  const qualityStatus = report.avgQualityScore >= 70
    ? chalk.green('↑ Good')
    : report.avgQualityScore >= 50
      ? chalk.yellow('→ Fair')
      : chalk.red('↓ Poor');

  metricsTable.push(
    ['Avg Quality', `${report.avgQualityScore}/100`, qualityStatus],
    ['Cache Hit Rate', `${report.cacheHitRate.toFixed(1)}%`, report.cacheHitRate >= 80 ? chalk.green('✓') : chalk.yellow('○')],
    ['Retry Rate', `${report.retryRate.toFixed(1)}%`, report.retryRate <= 10 ? chalk.green('✓') : chalk.red('!')],
    ['Tool Success', `${report.toolSuccessRate.toFixed(1)}%`, report.toolSuccessRate >= 90 ? chalk.green('✓') : chalk.yellow('○')],
  );

  console.log(metricsTable.toString());

  // Top prompts
  if (report.topPrompts.length > 0) {
    printSection('TOP PROMPTS', '🏆');

    for (let i = 0; i < Math.min(3, report.topPrompts.length); i++) {
      const p = report.topPrompts[i];
      const truncated = p.prompt.length > 50 ? p.prompt.slice(0, 47) + '...' : p.prompt;
      console.log(
        chalk.white(`${i + 1}. `) +
        chalk.green(`"${truncated}"`) +
        chalk.gray(` (Score: ${p.score})`)
      );
    }
  }

  // Worst prompts
  if (report.worstPrompts.length > 0) {
    printSection('NEEDS IMPROVEMENT', '⚠️');

    for (let i = 0; i < Math.min(3, report.worstPrompts.length); i++) {
      const p = report.worstPrompts[i];
      const truncated = p.prompt.length > 40 ? p.prompt.slice(0, 37) + '...' : p.prompt;
      const issue = p.issues[0] || 'Low score';
      console.log(
        chalk.white(`${i + 1}. `) +
        chalk.red(`"${truncated}"`) +
        chalk.gray(` (Score: ${p.score})`) +
        chalk.yellow(` - ${issue}`)
      );
    }
  }

  console.log();
}

/**
 * Print cost summary
 */
export function printCostSummary(analysis: CostAnalysis, title: string = 'Cost Summary'): void {
  printHeader(title);

  const costTable = new Table({
    head: [chalk.cyan('Category'), chalk.cyan('Amount'), chalk.cyan('% of Total')],
    style: { head: [], border: [] },
  });

  const breakdown = getCostBreakdown(analysis);
  for (const item of breakdown) {
    if (item.category === 'Cache Savings') {
      costTable.push([
        chalk.green(item.category),
        chalk.green(formatCost(-item.amount)),
        chalk.green('Saved'),
      ]);
    } else if (item.category === 'Estimated Waste') {
      costTable.push([
        chalk.red(item.category),
        chalk.red(formatCost(item.amount)),
        chalk.red(`${item.percentage.toFixed(1)}%`),
      ]);
    } else {
      costTable.push([
        item.category,
        formatCost(item.amount),
        `${item.percentage.toFixed(1)}%`,
      ]);
    }
  }

  costTable.push([
    chalk.bold('Total'),
    chalk.bold(formatCost(analysis.totalCostUSD)),
    chalk.bold('100%'),
  ]);

  console.log(costTable.toString());

  // Cost by model
  if (Object.keys(analysis.costByModel).length > 0) {
    printSection('BY MODEL', '🤖');

    const modelTable = new Table({
      head: [chalk.cyan('Model'), chalk.cyan('Cost')],
      style: { head: [], border: [] },
    });

    for (const [model, cost] of Object.entries(analysis.costByModel)) {
      const shortModel = model.replace('claude-', '').slice(0, 30);
      modelTable.push([shortModel, formatCost(cost)]);
    }

    console.log(modelTable.toString());
  }

  console.log();
}

/**
 * Print efficiency metrics
 */
export function printEfficiencyMetrics(metrics: EfficiencyMetrics): void {
  printSection('EFFICIENCY METRICS', '⚡');

  const rating = getEfficiencyRating(metrics);

  const table = new Table({
    head: [chalk.cyan('Metric'), chalk.cyan('Value'), chalk.cyan('Rating')],
    style: { head: [], border: [] },
  });

  for (const detail of rating.details) {
    const ratingColor = detail.rating === 'Excellent' || detail.rating === 'Fast'
      ? chalk.green
      : detail.rating === 'Good'
        ? chalk.blue
        : detail.rating === 'Fair' || detail.rating === 'Moderate'
          ? chalk.yellow
          : chalk.red;

    table.push([
      detail.metric,
      detail.value,
      ratingColor(detail.rating),
    ]);
  }

  console.log(table.toString());
  console.log();
  console.log(chalk.bold(`Overall Efficiency: ${rating.overall}`));
  console.log();
}

/**
 * Print pattern analysis
 */
export function printPatternAnalysis(patterns: PatternAnalysis): void {
  printSection('PATTERNS', '🔍');

  // Key metrics
  console.log(chalk.white('Retry Rate: ') + chalk.yellow(`${patterns.retryRate.toFixed(1)}%`));
  console.log(chalk.white('Tool Success: ') + chalk.green(`${patterns.toolSuccessRate.toFixed(1)}%`));
  console.log();

  // Tool usage breakdown
  if (Object.keys(patterns.toolUsageByType).length > 0) {
    printSection('TOOL USAGE', '🛠️');

    const toolTable = new Table({
      head: [chalk.cyan('Tool'), chalk.cyan('Uses'), chalk.cyan('Success'), chalk.cyan('Error Rate')],
      style: { head: [], border: [] },
    });

    const sortedTools = Object.entries(patterns.toolUsageByType)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10);

    for (const [name, stats] of sortedTools) {
      const errorRate = stats.total > 0
        ? ((stats.total - stats.success) / stats.total) * 100
        : 0;
      const errorColor = errorRate < 5 ? chalk.green : errorRate < 15 ? chalk.yellow : chalk.red;

      toolTable.push([
        name,
        stats.total.toString(),
        stats.success.toString(),
        errorColor(`${errorRate.toFixed(1)}%`),
      ]);
    }

    console.log(toolTable.toString());
  }

  console.log();
}

/**
 * Print best prompts
 */
export function printBestPrompts(
  prompts: Array<{ prompt: string; score: number; uuid: string }>,
  title: string = 'TOP PROMPTS'
): void {
  printSection(title, '🏆');

  if (prompts.length === 0) {
    console.log(chalk.gray('No prompts found'));
    return;
  }

  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i];
    const truncated = p.prompt.length > 60 ? p.prompt.slice(0, 57) + '...' : p.prompt;
    const scoreColor = p.score >= 90 ? chalk.green : p.score >= 70 ? chalk.blue : chalk.yellow;

    console.log(
      chalk.white(`${(i + 1).toString().padStart(2)}. `) +
      scoreColor(`[${p.score}]`) +
      chalk.white(` "${truncated}"`)
    );
  }

  console.log();
}

/**
 * Print worst prompts
 */
export function printWorstPrompts(
  prompts: Array<{ prompt: string; score: number; uuid: string; issues: string[] }>,
  title: string = 'PROMPTS NEEDING IMPROVEMENT'
): void {
  printSection(title, '⚠️');

  if (prompts.length === 0) {
    console.log(chalk.gray('No prompts found'));
    return;
  }

  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i];
    const truncated = p.prompt.length > 50 ? p.prompt.slice(0, 47) + '...' : p.prompt;
    const scoreColor = p.score < 30 ? chalk.red : p.score < 50 ? chalk.yellow : chalk.white;
    const issue = p.issues[0] || '';

    console.log(
      chalk.white(`${(i + 1).toString().padStart(2)}. `) +
      scoreColor(`[${p.score}]`) +
      chalk.red(` "${truncated}"`)
    );
    if (issue) {
      console.log(chalk.gray(`       └─ ${issue}`));
    }
  }

  console.log();
}

/**
 * Print a single prompt analysis
 */
export function printPromptAnalysis(
  prompt: string,
  score: PromptQualityScore
): void {
  const truncated = prompt.length > 70 ? prompt.slice(0, 67) + '...' : prompt;
  console.log(chalk.white(`Prompt: "${truncated}"`));
  console.log();

  const scoreTable = new Table({
    head: [chalk.cyan('Dimension'), chalk.cyan('Score'), chalk.cyan('Rating')],
    style: { head: [], border: [] },
  });

  const dimensions = [
    { name: 'Clarity', score: score.clarity },
    { name: 'Context', score: score.context },
    { name: 'Efficiency', score: score.efficiency },
    { name: 'Outcome', score: score.outcome },
  ];

  for (const dim of dimensions) {
    const rating = getQualityRating(dim.score);
    const color = dim.score >= 70 ? chalk.green : dim.score >= 50 ? chalk.yellow : chalk.red;

    scoreTable.push([
      dim.name,
      color(`${dim.score}/100`),
      color(rating),
    ]);
  }

  scoreTable.push([
    chalk.bold('Overall'),
    chalk.bold(`${score.overall}/100`),
    chalk.bold(getQualityRating(score.overall)),
  ]);

  console.log(scoreTable.toString());

  // Issues
  if (score.issues.length > 0) {
    console.log();
    console.log(chalk.red('Issues:'));
    for (const issue of score.issues) {
      console.log(chalk.red(`  • ${issue}`));
    }
  }

  // Suggestions
  if (score.suggestions.length > 0) {
    console.log();
    console.log(chalk.yellow('Suggestions:'));
    for (const suggestion of score.suggestions) {
      console.log(chalk.yellow(`  • ${suggestion}`));
    }
  }

  console.log();
}

/**
 * Print session summary
 */
export function printSessionSummary(
  sessionId: string,
  promptCount: number,
  cost: number,
  avgScore: number,
  duration: string
): void {
  console.log(chalk.gray('─'.repeat(52)));
  console.log(chalk.white(`Session: ${chalk.cyan(sessionId.slice(0, 8))}...`));
  console.log(
    chalk.gray('Prompts: ') + chalk.white(promptCount) +
    chalk.gray(' | Cost: ') + chalk.white(formatCost(cost)) +
    chalk.gray(' | Avg Score: ') + chalk.white(`${avgScore}/100`) +
    chalk.gray(' | Duration: ') + chalk.white(duration)
  );
}

/**
 * Print error message
 */
export function printError(message: string): void {
  console.error(chalk.red(`Error: ${message}`));
}

/**
 * Print warning message
 */
export function printWarning(message: string): void {
  console.log(chalk.yellow(`Warning: ${message}`));
}

/**
 * Print success message
 */
export function printSuccess(message: string): void {
  console.log(chalk.green(`✓ ${message}`));
}

/**
 * Print info message
 */
export function printInfo(message: string): void {
  console.log(chalk.blue(`ℹ ${message}`));
}

/**
 * Print no data message
 */
export function printNoData(message: string = 'No data found'): void {
  console.log();
  console.log(chalk.gray(message));
  console.log(chalk.gray('Make sure you have Claude Code sessions in ~/.claude/projects/'));
  console.log();
}
