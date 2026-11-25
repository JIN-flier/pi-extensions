import type { Activity } from "./activity.ts";
import type { SessionCandidate, TimestampedEntry } from "./sessions.ts";

export type Complete = (system: string, prompt: string) => Promise<string>;

export interface SessionSummary {
  sessionId: string;
  project: string;
  summary: string;
}

/**
 * 三个内部 skill 的正文（已去除 frontmatter）。
 * 它们只作为扩展内部的提示词资源，由 `skills.ts` 直接读取；
 * 不注册为 Pi 命令，因此用户不可见、不可直接调用。
 */
export interface ReportSkills {
  tasks: string;
  results: string;
  nextSteps: string;
}

export interface ProjectSummary {
  project: string;
  sessionCount: number;
  /** 每个字段都是对应 skill 输出的小节（标题 + 正文），可直接拼进报告。 */
  tasks: string;
  results: string;
  nextSteps: string;
}

const SYSTEM =
  "你是一个小助手，可以根据提供的活动记录按照第一人称视角生成报告。保留来源标记 [sessionId#entryId]。区分已完成、进行中、未完成、待验证。回答使用中文。";

function batches(items: string[], maxChars: number): string[][] {
  const result: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const item of items.flatMap((value) =>
    value.length > maxChars
      ? (value.match(new RegExp(`[\\s\\S]{1,${maxChars}}`, "g")) ?? [])
      : [value],
  )) {
    if (current.length && size + item.length > maxChars) {
      result.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += item.length;
  }
  if (current.length) result.push(current);
  return result;
}

async function condense(
  items: string[],
  instruction: string,
  complete: Complete,
): Promise<string> {
  let current = items;
  for (let round = 0; round < 10; round++) {
    if (current.join("\n\n").length <= 24_000) return current.join("\n\n");
    const next: string[] = [];
    for (const batch of batches(current, 22_000)) {
      next.push(
        await complete(SYSTEM, `${instruction}\n${batch.join("\n\n")}`),
      );
    }
    current = next;
  }
  throw new Error("摘要过长，无法收敛到模型上下文范围内");
}

async function summarizeBatches(
  items: string[],
  instruction: string,
  complete: Complete,
): Promise<string> {
  const parts = batches(items, 24_000);
  const summaries: string[] = [];
  for (const [index, part] of parts.entries()) {
    summaries.push(
      await complete(
        SYSTEM,
        `${instruction}\n片段 ${index + 1}/${parts.length}：\n${part.join("\n")}`,
      ),
    );
  }
  if (summaries.length === 1) return summaries[0];
  const condensed = await condense(
    summaries,
    "合并同一 Session 的分段摘要，去重并保留来源和状态。",
    complete,
  );
  return complete(
    SYSTEM,
    `合并同一 Session 的分段摘要，去重并保留来源和状态。\n${condensed}`,
  );
}

export async function summarizeSession<T extends TimestampedEntry>(
  session: SessionCandidate<T>,
  activities: Activity[],
  complete: Complete,
): Promise<SessionSummary> {
  const lines = activities.map(
    (activity) =>
      `[${activity.source}] ${activity.time} ${activity.kind}: ${activity.text}`,
  );
  const summary = await summarizeBatches(
    lines,
    `项目：${session.info.cwd || "未知项目"}\nSession：${session.info.id}\n概括任务、实际操作、代码修改、命令和实验结果、技术决策、研究思路、研究结论及遗留事项。逐项标记状态，不要把仅讨论的计划写成已完成。`,
    complete,
  );
  return {
    sessionId: session.info.id,
    project: session.info.cwd || "未知项目",
    summary: summary.trim(),
  };
}

// ============================================================
// 三个内部 skill 与报告三部分的映射
// ============================================================

const SECTION_PARTS = [
  { key: "tasks", skillName: "daily-report-tasks" },
  { key: "results", skillName: "daily-report-results" },
  { key: "nextSteps", skillName: "daily-report-next-steps" },
] as const;

/** 把内部 skill 正文包成模型可遵循的写作规范块。 */
export function wrapSkillBody(skillName: string, body: string): string {
  return [
    "使用以下 skill 作为写作规范，生成报告对应的部分。该 skill 仅供本工具内部使用，输出中不要提及 skill 本身：",
    `<skill name="${skillName}">`,
    body,
    "</skill>",
  ].join("\n");
}

/**
 * 从模型输出中取出小节正文：去掉 Markdown 代码围栏和标题前的引导语，
 * 从第一个标题行开始截取。没有标题时原样返回（仅 trim）。
 */
export function extractSection(text: string): string {
  const cleaned = text
    .replace(/^```(?:markdown|md)?\s*\r?\n/i, "")
    .replace(/\r?\n?```\s*$/, "")
    .trim();
  const heading = /^#{1,6}[ \t]+.+$/m.exec(cleaned);
  if (heading?.index === undefined) return cleaned;
  return cleaned.slice(heading.index).trim();
}

/** 按项目（cwd）分组，保持首次出现的顺序。 */
export function groupSessionsByProject(
  sessions: SessionSummary[],
): [string, SessionSummary[]][] {
  const groups = new Map<string, SessionSummary[]>();
  for (const session of sessions) {
    const group = groups.get(session.project);
    if (group) group.push(session);
    else groups.set(session.project, [session]);
  }
  return [...groups];
}

/** 用三个内部 skill 分别生成一个项目在报告中的三部分。 */
export async function summarizeProjectSections(
  project: string,
  sessions: SessionSummary[],
  skills: ReportSkills,
  complete: Complete,
): Promise<ProjectSummary> {
  const input = await condense(
    sessions.map(
      (session) => `Session ${session.sessionId}:\n${session.summary}`,
    ),
    "以下是同项目部分 Session 摘要。合并重复任务、关联工作，保留状态和来源标记。",
    complete,
  );
  const material = [
    `项目：${project}`,
    `Session 数：${sessions.length}`,
    "",
    "以下是该项目在统计时间范围内的全部 Session 摘要，请仅依据这些记录撰写：",
    input,
  ].join("\n");

  const [tasks, results, nextSteps] = await Promise.all(
    SECTION_PARTS.map(({ key, skillName }) =>
      complete(
        `${SYSTEM}\n\n${wrapSkillBody(skillName, skills[key])}`,
        material,
      ),
    ),
  );

  return {
    project,
    sessionCount: sessions.length,
    tasks: extractSection(tasks),
    results: extractSection(results),
    nextSteps: extractSection(nextSteps),
  };
}
