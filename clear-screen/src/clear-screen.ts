/**
 * /clear 的实现：擦掉 TUI 里可见的 header、资源提示与对话记录，
 * 不修改 session 文件，也不影响模型上下文。
 *
 * Pi 没有公开的 transcript accessor，所以必须依赖 Pi 1.6 的挂载布局。
 * 这个耦合面被收敛到 findDocument() 一处：只识别已知形状，认不出来就返回
 * false 并提示，绝不“猜一个容器清掉”。其余函数只处理已校验的 document。
 */
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Container, type Component, type TUI } from "@earendil-works/pi-tui";

/**
 * 判断是否为 Container 本身。
 *
 * 用 constructor 精确比对而不是 instanceof：ScrollView 等子类会改变
 * clear() 的语义（ScrollView.clear() 直接抛错），把它们当作可清空容器
 * 会破坏渲染树。
 */
const isPlainContainer = (component: Component): component is Container =>
  component instanceof Container && component.constructor === Container;

/**
 * 定位 document 容器（Pi 1.6 的挂载顺序为
 * [document, pending, status, above, editor, below, footer]）。
 *
 * 四道校验全通过才返回，任一失败返回 undefined：
 * 1. 顶层恰好 7 个区域，且都是 plain Container；
 * 2. 第 0 个区域的 children 恰好 3 个 plain Container
 *    （header / resources / chat）；
 * 3. 区域与 section 之间没有别名（同一对象不会出现两次）；
 * 4. 其余区域里不存在第二个“document 形状”的容器（否则无法判定哪个是真的）。
 *
 * 宁可不做也不猜：清错区域会让 editor / footer 消失，且很难恢复。
 */
export function findDocument(tui: TUI): Container | undefined {
  const regions = tui.children;
  if (regions.length !== 7 || !regions.every(isPlainContainer)) return;
  const document = regions[0];
  // 同一对象同时出现在区域和 section 里，说明布局不是预期的嵌套结构。
  if (
    document.children.length !== 3 ||
    !document.children.every(isPlainContainer) ||
    new Set([...regions, ...document.children]).size !== 10
  )
    return;
  // 再出现一个“三容器”区域就无法判断谁是 document，直接放弃。
  if (
    regions
      .slice(1)
      .some(
        (region) =>
          region.children.length === 3 &&
          region.children.every(isPlainContainer),
      )
  )
    return;
  return document;
}

/**
 * 清空 document 的三个 section；常规模式下再清掉终端 scrollback。
 *
 * 只动 document 子树：editor / footer / widget / pending 等区域保持原样。
 * 全屏模式由 alt-screen 渲染器自己拥有屏幕，不能去擦主屏的 scrollback。
 *
 * @returns 是否找到并清空了 document；false 表示布局不认识，未做任何修改
 */
export function wipe(tui: TUI): boolean {
  const document = findDocument(tui);
  if (!document) return false;

  for (const section of document.children) {
    if (isPlainContainer(section)) section.clear();
  }

  if (tui.mode === "regular") {
    // 3J 清终端 scrollback（不是所有终端都支持，失败也无害），再 2J + home。
    tui.terminal.write("\x1b[3J");
    tui.terminal.clearScreen();
  }
  // 两种模式都要丢掉渲染器自己的上一帧缓存，否则它会把刚擦掉的行 diff 回去。
  // requestRender(true) 是公开的 force 入口，比直接改渲染器私有状态安全。
  tui.requestRender(true);
  return true;
}

/**
 * /clear 命令入口。
 *
 * 清屏需要 TUI 实例，所以借 ctx.ui.custom 的 factory 参数取一次 tui：wipe()
 * 成功后立即 done()，宿主就不会挂载返回的空组件（依赖 interactive-mode
 * 对同步 done() 的短路，已在 1.6 上验证）。
 *
 * 两类失败分开处理：
 * - wipe() 抛错 → 不调 done()，让宿主 promise reject，这里报 error；
 * - 布局认不出来 → wipe() 返回 false，正常结束并给出 warning。
 */
export async function clearScreen(ctx: ExtensionCommandContext): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify(`/clear needs TUI mode (running in ${ctx.mode})`, "warning");
    return;
  }

  let wiped = false;
  try {
    await ctx.ui.custom<void>((tui, _theme, _kb, done) => {
      // 先清后 done：factory 同步抛错时宿主会 reject，而不是被 done() 提前化解。
      wiped = wipe(tui);
      done();
      // 空组件只是兜底：正常路径下宿主不会挂载它。
      return { render: () => [], invalidate: () => {} };
    });
  } catch (error) {
    ctx.ui.notify(
      `/clear failed: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
    return;
  }
  if (!wiped) {
    ctx.ui.notify("/clear: unrecognised TUI layout, nothing wiped", "warning");
  }
}
