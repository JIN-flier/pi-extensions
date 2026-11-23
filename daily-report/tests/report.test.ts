import assert from "node:assert/strict";
import test from "node:test";

import { renderReport } from "../src/report.ts";

import type { ProjectSummary } from "../src/summarize.ts";

function project(name: string, sessionCount = 1): ProjectSummary {
  return {
    project: name,
    sessionCount,
    tasks: `### 具体任务进展\n\n${name} 的任务段落。`,
    results: `### 得到什么结果\n\n${name} 的结果段落。`,
    nextSteps: `### 后续安排\n\n${name} 的后续段落。`,
  };
}

test("renderReport 输出统计头，并按项目整合三个部分", () => {
  const markdown = renderReport(
    [project("/proj/a", 2), project("/proj/b")],
    {
      from: new Date(2026, 10, 23),
      to: new Date(2026, 10, 24),
      allBranches: true,
    },
    3,
    ["Session /tmp/x.json 无法读取：bad"],
  );

  assert.ok(markdown.startsWith("# Pi Agent 工作报告"));
  assert.match(markdown, /分支范围：完整分支树/);
  assert.match(markdown, /Session 数：3/);
  assert.match(markdown, /项目数：2/);

  // 项目顺序与传入顺序一致
  const first = markdown.indexOf("## 项目：/proj/a");
  const second = markdown.indexOf("## 项目：/proj/b");
  assert.ok(first >= 0 && second > first);

  // 每个项目内三部分按 tasks → results → nextSteps 排列
  const aTasks = markdown.indexOf("/proj/a 的任务段落。");
  const aResults = markdown.indexOf("/proj/a 的结果段落。");
  const aNext = markdown.indexOf("/proj/a 的后续段落。");
  assert.ok(aTasks < aResults && aResults < aNext);

  // 小节标题来自 skill 输出，原样保留
  assert.match(markdown, /### 具体任务进展/);
  assert.match(markdown, /### 得到什么结果/);
  assert.match(markdown, /### 后续安排/);

  // 生成警告作为报告末尾的独立小节
  assert.match(markdown, /## 生成警告\n\n- Session \/tmp\/x\.json 无法读取：bad/);
  assert.ok(markdown.endsWith("\n"));
});

test("renderReport 在没有任何项目时输出空态说明且不带警告小节", () => {
  const markdown = renderReport(
    [],
    {
      from: new Date(2026, 10, 23),
      to: new Date(2026, 10, 24),
      allBranches: false,
    },
    0,
    [],
  );

  assert.match(markdown, /指定时间范围内没有发现可分析的 Session 活动。/);
  assert.match(markdown, /分支范围：当前活动分支/);
  assert.ok(!markdown.includes("## 生成警告"));
});
