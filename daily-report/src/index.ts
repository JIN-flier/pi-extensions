import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  SessionManager,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { runReport } from "./run.ts";
import { createReportComplete, loadReportSkills } from "./skills.ts";

export default function dailyReport(pi: ExtensionAPI): void {
  pi.registerCommand("daily-report", {
    description: "跨项目、跨 Session 生成指定时间范围的 Markdown 工作报告",
    handler: async (args, ctx) => {
      if (!ctx.model) {
        ctx.ui.notify("请先选择可用模型，再运行 /daily-report。", "error");
        return;
      }
      const model = ctx.model;
      try {
        const skills = await loadReportSkills();
        const result = await runReport(args, {
          cwd: ctx.cwd,
          source: SessionManager,
          skills,
          complete: await createReportComplete(pi, async (system, prompt) => {
            const response = await ctx.modelRegistry.complete(model, {
              systemPrompt: system,
              messages: [
                { role: "user", content: prompt, timestamp: Date.now() },
              ],
            });
            if (
              response.stopReason === "error" ||
              response.stopReason === "aborted"
            ) {
              throw new Error(
                response.errorMessage || `模型调用失败：${response.stopReason}`,
              );
            }
            const text = response.content
              .filter(
                (part): part is Extract<typeof part, { type: "text" }> =>
                  part.type === "text",
              )
              .map((part) => part.text)
              .join("\n")
              .trim();
            if (!text) throw new Error("模型未返回摘要文本");
            return text;
          }),
          write: async (path, content) => {
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, content, "utf8");
          },
          progress: (message) => ctx.ui.notify(message, "info"),
        });
        ctx.ui.notify(
          `报告已保存：${result.path}（${result.projectCount} 个项目，${result.sessionCount} 个 Session）`,
          result.warningCount ? "warning" : "info",
        );
      } catch (error) {
        ctx.ui.notify(
          `报告生成失败：${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
      }
    },
  });
}
