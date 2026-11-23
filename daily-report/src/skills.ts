import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  stripFrontmatter,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

import type { Complete, ReportSkills } from "./summarize.ts";

/**
 * 三个 skill 文件（skills/*.md）是本扩展的内部提示词资源：
 *
 * - package.json 的 `pi.skills` 显式声明为 []，因此 Pi 不会发现它们、
 *   不会在系统提示词中广播名称与描述、也不会注册 /skill:... 命令，
 *   用户看不到、也无法直接调用。
 * - 只由 loadReportSkills() 直接读取，注入到对应部分的模型调用里。
 */

const SKILL_FILES = {
  tasks: "daily-report-tasks.md",
  results: "daily-report-results.md",
  nextSteps: "daily-report-next-steps.md",
} as const;

async function readSkillBody(fileName: string): Promise<string> {
  const skillsDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../skills",
  );
  const body = stripFrontmatter(
    await readFile(resolve(skillsDir, fileName), "utf8"),
  ).trim();
  if (!body) throw new Error(`内部 skill 文件内容为空：${fileName}`);
  return body;
}

/** 读取报告三部分对应的三个内部 skill 正文。 */
export async function loadReportSkills(): Promise<ReportSkills> {
  const [tasks, results, nextSteps] = await Promise.all([
    readSkillBody(SKILL_FILES.tasks),
    readSkillBody(SKILL_FILES.results),
    readSkillBody(SKILL_FILES.nextSteps),
  ]);
  return { tasks, results, nextSteps };
}

/**
 * 直连模型的调用不会展开 /skill 命令，所以把用户已安装的 humanizer-zh
 * skill 正文一并放进 system prompt，用于润色中文表达。
 */
export async function createReportComplete(
  pi: Pick<ExtensionAPI, "getCommands">,
  complete: Complete,
): Promise<Complete> {
  const skill = pi
    .getCommands()
    .find(
      (command) =>
        command.source === "skill" && command.name === "skill:humanizer-zh",
    );
  if (!skill) return complete;
  const body = stripFrontmatter(
    await readFile(skill.sourceInfo.path, "utf8"),
  ).trim();
  return (system, prompt) =>
    complete(
      `${system}\n\n使用以下 humanizer-zh skill 润色中文表达。保持事实、工作状态、来源标记及要求的输出格式。\n<skill name="humanizer-zh" location="${skill.sourceInfo.path}">\nReferences are relative to ${skill.sourceInfo.baseDir ?? dirname(skill.sourceInfo.path)}.\n\n${body}\n</skill>`,
      prompt,
    );
}
