import assert from "node:assert/strict";
import test from "node:test";

import {
  extractSection,
  groupSessionsByProject,
  summarizeProjectSections,
  wrapSkillBody,
  type Complete,
  type ReportSkills,
  type SessionSummary,
} from "../src/summarize.ts";

function recordingComplete(): {
  complete: Complete;
  calls: { system: string; prompt: string }[];
} {
  const calls: { system: string; prompt: string }[] = [];
  const complete: Complete = async (system, prompt) => {
    calls.push({ system, prompt });
    return `### 部分${calls.length}\n\n第 ${calls.length} 段输出。`;
  };
  return { complete, calls };
}

test("extractSection 去掉围栏与引导语，从第一个标题开始截取", () => {
  assert.equal(
    extractSection(
      "好的，以下是该部分内容：\n\n```markdown\n### 具体任务进展\n\n做了 A、B。\n```",
    ),
    "### 具体任务进展\n\n做了 A、B。",
  );
  assert.equal(
    extractSection("### 得到什么结果\n\n结果段落。"),
    "### 得到什么结果\n\n结果段落。",
  );
  assert.equal(extractSection("没有标题的段落。"), "没有标题的段落。");
});

test("groupSessionsByProject 按首次出现顺序分组", () => {
  const sessions: SessionSummary[] = [
    { sessionId: "1", project: "/a", summary: "x" },
    { sessionId: "2", project: "/b", summary: "x" },
    { sessionId: "3", project: "/a", summary: "x" },
  ];

  assert.deepEqual(
    groupSessionsByProject(sessions).map(([project, group]) => [
      project,
      group.length,
    ]),
    [
      ["/a", 2],
      ["/b", 1],
    ],
  );
  assert.deepEqual(groupSessionsByProject([]), []);
});

test("summarizeProjectSections 用三个内部 skill 分别生成三部分", async () => {
  const skills: ReportSkills = {
    tasks: "TASKS-BODY",
    results: "RESULTS-BODY",
    nextSteps: "NEXT-BODY",
  };
  const { complete, calls } = recordingComplete();
  const sessions: SessionSummary[] = [
    { sessionId: "s1", project: "/a", summary: "摘要一" },
    { sessionId: "s2", project: "/a", summary: "摘要二" },
  ];

  const result = await summarizeProjectSections("/a", sessions, skills, complete);

  assert.equal(result.project, "/a");
  assert.equal(result.sessionCount, 2);
  assert.equal(calls.length, 3);

  // 每个部分都注入了对应 skill 的正文
  assert.ok(calls[0].system.includes("TASKS-BODY"));
  assert.ok(calls[1].system.includes("RESULTS-BODY"));
  assert.ok(calls[2].system.includes("NEXT-BODY"));
  assert.ok(calls[0].system.includes('<skill name="daily-report-tasks">'));
  assert.ok(calls[1].system.includes('<skill name="daily-report-results">'));
  assert.ok(calls[2].system.includes('<skill name="daily-report-next-steps">'));

  // 三个调用共享同一份项目材料（项目名 + 全部 Session 摘要）
  for (const call of calls) {
    assert.ok(call.prompt.includes("项目：/a"));
    assert.ok(call.prompt.includes("Session 数：2"));
    assert.ok(call.prompt.includes("s1"));
    assert.ok(call.prompt.includes("摘要二"));
  }

  // 输出即三个小节，与三个 skill 一一对应
  assert.equal(result.tasks, "### 部分1\n\n第 1 段输出。");
  assert.equal(result.results, "### 部分2\n\n第 2 段输出。");
  assert.equal(result.nextSteps, "### 部分3\n\n第 3 段输出。");
});

test("summarizeProjectSections 传递模型输出中的引导语与围栏", async () => {
  const skills: ReportSkills = { tasks: "T", results: "R", nextSteps: "N" };
  const calls: string[] = [];
  const complete: Complete = async (_system, prompt) => {
    calls.push(prompt);
    return `\`\`\`markdown\n${calls.length === 1 ? "前面的话\n" : ""}### 小节 ${calls.length}\n\n正文 ${calls.length}\n\`\`\``;
  };

  const result = await summarizeProjectSections(
    "/a",
    [{ sessionId: "s1", project: "/a", summary: "摘要" }],
    skills,
    complete,
  );

  assert.equal(result.tasks, "### 小节 1\n\n正文 1");
  assert.equal(result.results, "### 小节 2\n\n正文 2");
  assert.equal(result.nextSteps, "### 小节 3\n\n正文 3");
});

test("wrapSkillBody 包裹 skill 正文并注明仅供内部使用", () => {
  const wrapped = wrapSkillBody("daily-report-tasks", "正文");

  assert.match(wrapped, /<skill name="daily-report-tasks">/);
  assert.ok(wrapped.includes("正文"));
  assert.ok(wrapped.includes("仅供本工具内部使用"));
});
