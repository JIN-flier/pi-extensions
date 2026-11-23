import { resolve } from "node:path";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { extractActivities } from "./activity.ts";
import { parseOptions } from "./options.ts";
import { renderReport } from "./report.ts";
import { discoverSessions, type SessionSource } from "./sessions.ts";
import {
  groupSessionsByProject,
  summarizeProjectSections,
  summarizeSession,
  type Complete,
  type ReportSkills,
  type SessionSummary,
} from "./summarize.ts";

export interface RunDependencies {
  cwd: string;
  now?: Date;
  source: SessionSource<SessionEntry>;
  /** 三个内部 skill 正文，指导每个项目三部分的生成。 */
  skills: ReportSkills;
  complete: Complete;
  write(path: string, content: string): Promise<void>;
  progress?: (message: string) => void;
}

export interface RunResult {
  path: string;
  sessionCount: number;
  projectCount: number;
  warningCount: number;
}

export async function runReport(
  args: string,
  dependencies: RunDependencies,
): Promise<RunResult> {
  const options = parseOptions(args, dependencies.now);
  const warnings: string[] = [];
  dependencies.progress?.("正在查找跨项目 Session…");
  const candidates = await discoverSessions(
    dependencies.source,
    options,
    options.allBranches,
    (path, error) => {
      warnings.push(
        `Session ${path} 无法读取：${error instanceof Error ? error.message : String(error)}`,
      );
    },
  );
  const summaries: SessionSummary[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const activities = extractActivities(candidate.entries, candidate.info.id);
    if (!activities.length) continue;
    dependencies.progress?.(
      `正在总结 Session ${index + 1}/${candidates.length}…`,
    );
    summaries.push(
      await summarizeSession(candidate, activities, dependencies.complete),
    );
  }
  const projects = [];
  for (const [project, group] of groupSessionsByProject(summaries)) {
    dependencies.progress?.(`正在生成项目 ${project} 的三部分内容…`);
    projects.push(
      await summarizeProjectSections(
        project,
        group,
        dependencies.skills,
        dependencies.complete,
      ),
    );
  }
  const report = renderReport(projects, options, summaries.length, warnings);
  const day = `${options.from.getFullYear()}-${String(options.from.getMonth() + 1).padStart(2, "0")}-${String(options.from.getDate()).padStart(2, "0")}`;
  const path = resolve(
    dependencies.cwd,
    options.output ?? `reports/daily-report-${day}.md`,
  );
  await dependencies.write(path, report);
  return {
    path,
    sessionCount: summaries.length,
    projectCount: projects.length,
    warningCount: warnings.length,
  };
}
