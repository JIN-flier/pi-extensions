/**
 * 扩展入口：当前只有一个 `/daily-report` 命令。
 *
 * 统计口径来自当前 session 分支（`sessionManager.getBranch()`），渲染逻辑在
 * `report.ts` 里，都是纯函数。后续要接文件落盘、跨 session 聚合或多日汇总时，
 * 在这里加 command / tool，保持 `report.ts` 无副作用。
 */
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

import { formatReport, formatSummaryLine, summarize } from "./report.ts";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function showDailyReport(
  _args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const stats = summarize(ctx.sessionManager.getBranch());
  const markdown = formatReport(stats, {
    date: todayISO(),
    sessionId: ctx.sessionManager.getSessionId(),
    cwd: ctx.cwd,
  });

  if (!ctx.hasUI) {
    // 非交互模式（print / rpc）没有通知面板，直接输出 Markdown。
    console.log(markdown);
    return;
  }

  ctx.ui.notify(`Daily report: ${formatSummaryLine(stats)}`, "info");
}

export default function dailyReport(pi: ExtensionAPI): void {
  pi.registerCommand("daily-report", {
    description: "Summarize the current session into a daily report",
    handler: showDailyReport,
  });
}
