import type { ProjectSummary } from "./summarize.ts";
import type { ReportOptions } from "./options.ts";

/**
 * 把统计信息、各项目由三个内部 skill 生成的小节以及生成警告，
 * 整合成最终的报告 Markdown。
 */
export function renderReport(
  projects: ProjectSummary[],
  options: Pick<ReportOptions, "from" | "to" | "allBranches">,
  sessionCount: number,
  warnings: string[],
): string {
  const header = [
    "# Pi Agent 工作报告",
    "",
    `统计范围：${options.from.toLocaleString("zh-CN")} 至 ${options.to.toLocaleString("zh-CN")}（结束时刻不含）`,
    `分支范围：${options.allBranches ? "完整分支树" : "当前活动分支"}`,
    `Session 数：${sessionCount}`,
    `项目数：${projects.length}`,
  ].join("\n");

  const body = projects.length
    ? projects
        .map((project) =>
          [
            `## 项目：${project.project}`,
            "",
            `Session 数：${project.sessionCount}`,
            "",
            project.tasks,
            "",
            project.results,
            "",
            project.nextSteps,
          ].join("\n"),
        )
        .join("\n\n")
    : "指定时间范围内没有发现可分析的 Session 活动。";

  const warningsSection = warnings.length
    ? `\n\n## 生成警告\n\n${warnings.map((warning) => `- ${warning}`).join("\n")}`
    : "";

  return `${header}\n\n${body}${warningsSection}\n`;
}
