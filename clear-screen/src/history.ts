/**
 * /history 的适配层：取数据 → 建视图 → 开 overlay。
 *
 * 这一层只负责“接线”：数据整形在 readPairs()，渲染与输入在 HistoryView。
 */
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { readPairs } from "./history-data.ts";
import { HistoryView } from "./history-view.ts";

/**
 * 打开历史浏览 overlay。
 *
 * 只在 TUI 模式下可用：rpc 下 ui.custom() 返回 undefined，json/print 下所有
 * UI 方法都是 no-op，与其静默失败不如直接提示并返回。
 */
export async function showHistory(ctx: ExtensionCommandContext): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify(
      `/history needs TUI mode (running in ${ctx.mode})`,
      "warning",
    );
    return;
  }
  // 只读一次快照：overlay 打开期间即使 agent 还在输出，视图也保持稳定。
  const pairs = readPairs(ctx.sessionManager.getBranch());
  let view: HistoryView | undefined;
  await ctx.ui.custom<void>(
    // factory 负责建视图；onHandle 在组件真正挂载后才给出 overlay handle。
    (tui, theme, _kb, done) =>
      (view = new HistoryView(pairs, tui, theme, done)),
    {
      overlay: true, // 浮层，不改动下方 transcript
      overlayOptions: {
        anchor: "center",
        width: "88%",
        maxHeight: "85%",
        margin: 1,
        nonCapturing: false,
      },
      // activate() 抢焦点并在常规模式开启鼠标上报。
      onHandle: (handle) => view?.activate(handle),
    },
  );
}
