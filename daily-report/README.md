# Pi Agent Daily Report

跨项目、跨 Session 的 `/daily-report` 扩展。通过 Pi SDK 的 `SessionManager.listAll()` 发现 Session，以创建和修改时间预筛选，再通过 `SessionManager.open()` 读取候选 Session，并按每条 Entry 的时间戳筛选活动。默认只读取活动分支；`--all-branches` 读取完整分支树。

## 安装

需要 Pi 1.6.x 和 Node.js 22.19 或更新版本。当前源码可作为本地 Pi package 加载：

```bash
npm install                                          # 在 pi-extensions 仓库根目录执行一次
pi install /home/flier/agent/pi-agent/pi-extensions/daily-report
```

也可临时运行 `pi -e /home/flier/agent/pi-agent/pi-extensions/daily-report/src/index.ts`。安装后在 Pi 中选择可用模型，再执行命令。

## 用法

```text
/daily-report
/daily-report --date 2026-11-03
/daily-report --from 2026-11-01 --to 2026-11-03
/daily-report --from 2026-11-03T09:00 --to 2026-11-03T18:00 --all-branches
/daily-report --date 2026-11-03 --output "reports/2026-11-03 work.md"
```

`--date` 接受本地日历日期，统计该日 00:00 至次日 00:00。`--from` 和 `--to` 接受 `YYYY-MM-DD` 或 ISO 8601 日期时间；无时区的日期时间按本地时区解释。有日期但无时间的 `--to` 包含该完整日期；日期时间的 `--to` 是不含的结束时刻。未指定范围时，统计本地当天 00:00 至命令执行时刻。`--date` 不可与 `--from`、`--to` 混用。

默认写入当前工作目录的 `reports/daily-report-YYYY-MM-DD.md`；`--output` 或 `-o` 可指定输出路径，相对路径以当前工作目录为基准。

报告由统计头和每个项目的三个小节组成；无法读取的候选 Session 会汇总到报告末尾的“生成警告”小节。

```markdown
# Pi Agent 工作报告
统计范围 / 分支范围 / Session 数 / 项目数

## 项目：<cwd>
Session 数：N

### 具体任务进展
### 得到什么结果
### 后续安排
```

每个小节的内容分别由 `skills/` 下的三个内部 skill 指导生成，一次模型调用对应一个部分：

| 文件 | 生成的小节 |
| --- | --- |
| `skills/daily-report-tasks.md` | `### 具体任务进展` |
| `skills/daily-report-results.md` | `### 得到什么结果` |
| `skills/daily-report-next-steps.md` | `### 后续安排` |

这三个文件是**扩展内部的提示词资源，不是注册给 Pi 的 skill**：`package.json` 的 `pi.skills` 显式声明为 `[]`，Pi 因此不会发现它们，不会在系统提示词里广播名称和描述，也不会生成 `/skill:daily-report-*` 命令。用户既看不到也无法直接调用，只有 `src/skills.ts` 会读取正文并注入对应的模型调用（`tests/skills.test.ts` 有防回归断言）。

同一项目的三个部分并行生成，共享同一份项目材料；模型输出中的引导语与 Markdown 围栏会被剥离，只保留从第一个标题开始的部分，再按项目顺序整合进最终文件。

调用模型前，扩展通过 `pi.getCommands()` 检查 `skill:humanizer-zh`。若存在该 skill，就读取其指令并用于各层汇总，润色中文表达，同时保留事实、工作状态和来源标记；若不存在则按原流程汇总。

扩展先按 Session 汇总，再按项目归并。分析提示要求区分实际执行、仅讨论的计划和待验证结果；工具调用与工具结果分别记录。过长的单条记录会截断，过长的 Session 记录会分段汇总。

## 开发

```bash
npm test                             # node --experimental-strip-types --test tests/*.test.ts
npm run typecheck
```
