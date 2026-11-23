import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createReportComplete,
  loadReportSkills,
} from "../src/skills.ts";

import type {
  ExtensionAPI,
  SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";

test("loadReportSkills 读取三个内部 skill 并去除 frontmatter", async () => {
  const skills = await loadReportSkills();

  for (const body of [skills.tasks, skills.results, skills.nextSteps]) {
    assert.ok(body.length > 200, "skill 正文不应为空");
    assert.ok(!body.includes("---"), "frontmatter 应被去除");
    assert.ok(!/^name:/m.test(body), "frontmatter 字段应被去除");
  }
  assert.match(skills.tasks, /# 具体干了什么任务/);
  assert.match(skills.results, /# 得到什么结果/);
  assert.match(skills.nextSteps, /# 后续如何安排/);
});

test("manifest 不声明 skills：内部 skill 不会被注册为命令，用户不可调用", async () => {
  const manifest = JSON.parse(
    await readFile(
      resolve(dirname(fileURLToPath(import.meta.url)), "../package.json"),
      "utf8",
    ),
  ) as { pi?: { extensions?: string[]; skills?: string[] } };

  assert.ok(manifest.pi?.extensions?.length, "扩展入口应存在");
  // 显式空数组或缺失都表示不注册；只要非空列表出现就说明可见性被破坏。
  assert.ok(!manifest.pi?.skills?.length, "pi.skills 必须保持为空");
});

test("createReportComplete 在未安装 humanizer-zh 时原样透传", async () => {
  const complete = async (system: string, prompt: string) =>
    `${system}|${prompt}`;
  const pi = {
    getCommands: () => [],
  } as unknown as Pick<ExtensionAPI, "getCommands">;

  const wrapped = await createReportComplete(pi, complete);

  assert.equal(wrapped, complete);
});

test("createReportComplete 注入 humanizer-zh skill 正文", async () => {
  const dir = await mkdtemp(join(tmpdir(), "daily-report-skills-"));
  const skillPath = join(dir, "SKILL.md");
  await writeFile(
    skillPath,
    "---\nname: humanizer-zh\ndescription: x\n---\n\n# 润色\n\n保持自然。\n",
    "utf8",
  );

  const command: SlashCommandInfo = {
    name: "skill:humanizer-zh",
    source: "skill",
    sourceInfo: {
      path: skillPath,
      source: "user",
      scope: "user",
      origin: "top-level",
    },
  };
  const pi = {
    getCommands: () => [command],
  } as unknown as Pick<ExtensionAPI, "getCommands">;

  const wrapped = await createReportComplete(
    pi,
    async (system, prompt) => `${system}\n---PROMPT:${prompt}`,
  );
  const output = await wrapped("SYSTEM-BASE", "PROMPT-BODY");

  assert.ok(output.includes("SYSTEM-BASE"), "原 system 应保留");
  assert.ok(output.includes("PROMPT-BODY"), "原 prompt 应保留");
  assert.ok(output.includes("humanizer-zh"), "skill 名应出现");
  assert.ok(output.includes("保持自然"), "skill 正文应被注入");
});
