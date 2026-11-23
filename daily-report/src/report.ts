/**
 * 纯函数层：从 session 分支条目里统计当天的工作量，并渲染成 Markdown。
 * 这里不碰 Pi 的运行时，方便直接单测。
 */
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export interface ReportStats {
  userTurns: number;
  assistantTurns: number;
  toolCalls: number;
  toolResults: number;
  compactions: number;
  /** 出现过的模型，按首次出现顺序去重，形如 `anthropic/claude-...`。 */
  models: string[];
}

export interface ReportMeta {
  /** ISO 日期，例如 `2026-11-23`。 */
  date: string;
  sessionId: string;
  cwd: string;
}

export function summarize(entries: readonly SessionEntry[]): ReportStats {
  const stats: ReportStats = {
    userTurns: 0,
    assistantTurns: 0,
    toolCalls: 0,
    toolResults: 0,
    compactions: 0,
    models: [],
  };

  const rememberModel = (provider: string, id: string): void => {
    const key = `${provider}/${id}`;
    if (!stats.models.includes(key)) stats.models.push(key);
  };

  for (const entry of entries) {
    if (entry.type === "compaction") {
      stats.compactions += 1;
      continue;
    }

    if (entry.type === "model_change") {
      rememberModel(entry.provider, entry.modelId);
      continue;
    }

    if (entry.type !== "message") continue;

    const { message } = entry;
    switch (message.role) {
      case "user":
        stats.userTurns += 1;
        break;
      case "toolResult":
        stats.toolResults += 1;
        break;
      case "assistant": {
        stats.assistantTurns += 1;
        rememberModel(message.provider, message.model);
        if (Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === "toolCall") stats.toolCalls += 1;
          }
        }
        break;
      }
      default:
        break;
    }
  }

  return stats;
}

export function formatReport(stats: ReportStats, meta: ReportMeta): string {
  const lines = [
    `## Daily report — ${meta.date}`,
    "",
    `- Session: \`${meta.sessionId}\``,
    `- Working directory: \`${meta.cwd}\``,
    `- User turns: ${stats.userTurns}`,
    `- Assistant turns: ${stats.assistantTurns}`,
    `- Tool calls: ${stats.toolCalls}`,
    `- Tool results: ${stats.toolResults}`,
    `- Compactions: ${stats.compactions}`,
    `- Models: ${stats.models.length > 0 ? stats.models.join(", ") : "—"}`,
  ];

  return lines.join("\n");
}

/** 单行摘要，供 `ctx.ui.notify` 这类只显示一行的场景使用。 */
export function formatSummaryLine(stats: ReportStats): string {
  return [
    `${stats.userTurns} user turns`,
    `${stats.assistantTurns} assistant turns`,
    `${stats.toolCalls} tool calls`,
    `${stats.compactions} compactions`,
  ].join(" · ");
}
