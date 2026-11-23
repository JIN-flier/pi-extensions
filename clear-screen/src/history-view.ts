/**
 * HistoryView：历史浏览 overlay 的组件实现。
 *
 * 结构是 ScrollView 套一组卡片（见构造函数），本类只做四件事：
 * 1. 每帧重新登记每张卡片在文档里的行号（滚动定位与吸顶都依赖它）；
 * 2. 驱动 ScrollView 的布局、视口裁剪与宽度变化时的位置保持；
 * 3. 合成吸顶 Query，再交给 frameLines 套外层框；
 * 4. 把键盘 / 鼠标输入翻译成“滚动、选择、关闭”三种动作。
 */
import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Key,
  Markdown,
  matchesKey,
  ScrollView,
  Spacer,
  Text,
  truncateToWidth,
  type Component,
  type OverlayHandle,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  type TUI,
} from "@earendil-works/pi-tui";
import type { QAPair } from "./history-data.ts";
import { frameLines, HistoryFrame } from "./history-frame.ts";
import { trackHistoryMouse } from "./history-mouse.ts";

/**
 * 键位表：hint 只写在每组第一个键上，拼提示行时空串会被过滤掉。
 * action 是唯一需要扩展的地方，输入处理完全由这张表驱动。
 */
const bindings = [
  {
    keys: [Key.escape, Key.ctrl("c")],
    hint: "Esc / Ctrl+C 退出",
    action: "close",
  },
  { keys: [Key.up], hint: "↑/↓ / 滚轮 逐行滚动", action: "up" },
  { keys: [Key.down], hint: "", action: "down" },
  { keys: [Key.left], hint: "←/→ 选择", action: "left" },
  { keys: [Key.right], hint: "", action: "right" },
  { keys: [Key.home], hint: "Home/End 首尾", action: "home" },
  { keys: [Key.end], hint: "", action: "end" },
] as const;

type Action = (typeof bindings)[number]["action"];

/**
 * 把鼠标滚轮序列解析成滚动动作。
 *
 * 常规模式的 TUI 会把原始鼠标输入直接交给聚焦的 overlay，所以这里要自己
 * 解析两种编码：SGR（`\x1b[<button;x;yM`）与旧式 X10 的 6 字节序列。
 * 只接受滚轮（button 的第 6 位），方向取最低两位。
 */
function wheelAction(data: string): "up" | "down" | undefined {
  const sgr = /^\x1b\[<(\d+);\d+;\d+M$/.exec(data);
  const button = sgr
    ? Number(sgr[1])
    : data.length === 6 && data.startsWith("\x1b[M")
      ? data.charCodeAt(3) - 32
      : undefined;
  if (button === undefined || (button & 64) === 0 || (button & 3) > 1) return;
  return (button & 3) === 0 ? "up" : "down";
}

interface Card {
  /** 该卡片的完整文档子树，行高由它自己渲染决定。 */
  content: Container;
  query: HistoryFrame;
  answer: HistoryFrame;
  /** 在文档中的起始行（每帧由 render 重算）。 */
  start: number;
  /** 结束行（不含），start/end 之间是该卡片占用的行区间。 */
  end: number;
}

export class HistoryView implements Component {
  /** Focusable 约定字段：由宿主 setFocus 写入，本类不主动改。 */
  focused = false;
  /** 鼠标代理的撤销函数，dispose 时调用。 */
  private releaseMouse?: () => void;
  private readonly content = new Container();
  private readonly scrollView = new ScrollView(this.content, {
    follow: "none",
  });
  private readonly cards: Card[] = [];
  /** 当前选中的卡片，决定边框颜色与 ←/→ 的目标。 */
  private selected: number;
  /** 上一次渲染的宽度；-1 表示还没渲染过。 */
  private width = -1;
  /** 首次布局要把视口定位到最后一张卡片。 */
  private initialized = false;
  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly done: () => void;

  /**
   * 按问答对建好整棵文档树（只建一次，之后只有行号随渲染更新）。
   * 每张卡片 = Query 框 + Assistant 框，卡片之间留一行空白；初始选中最后
   * 一轮，符合“打开历史先看最近”的直觉。
   */
  constructor(
    pairs: readonly QAPair[],
    tui: TUI,
    theme: Theme,
    done: () => void,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.done = done;
    this.selected = Math.max(0, pairs.length - 1);
    for (const [index, pair] of pairs.entries()) {
      const content = new Container();
      const query = new HistoryFrame(
        new Text(pair.question, 0, 0),
        `#${index + 1}/${pairs.length} · Query`,
      );
      const answer = new HistoryFrame(
        new Markdown(pair.answer || "（无正文回答）", 0, 0, getMarkdownTheme()),
        "Assistant",
      );
      content.addChild(query);
      content.addChild(answer);
      this.content.addChild(content);
      if (index < pairs.length - 1) this.content.addChild(new Spacer(1));
      this.cards.push({ content, query, answer, start: 0, end: 0 });
    }
    if (!pairs.length)
      this.content.addChild(new Text("（暂无对话历史）", 0, 0));
  }

  /**
   * 返回第 line 行落在哪张卡片上。
   *
   * 行号落在卡片之间的空隙里时归属于上一张：这样滚动到卡片下方的空白处时，
   * 吸顶的仍是刚读完的那个提问。
   */
  private cardAt(line: number): number {
    let index = 0;
    for (let i = 1; i < this.cards.length; i++) {
      if (this.cards[i].start > line) break;
      index = i;
    }
    return index;
  }

  /**
   * 把当前卡片的 Query 合成到视口顶部（吸顶效果）。
   *
   * - 卡片恰好从视口顶部开始时直接跳过，避免同一段文字出现两份；
   * - 置顶副本按 maxPinnedRows 裁剪，至少给答案留 2 行；
   * - y < 0 时逐行向上顶出旧副本，模拟下一张 Query 把上一张推走；
   * - 副本的首末行登记为分隔线，保证接缝处仍是 ├/┤ 而不是断开的 │。
   */
  private pinQuery(body: string[], width: number, ruleRows: Set<number>): void {
    if (body.length < 3 || !this.cards.length) return;
    const top = this.scrollView.scrollTop;
    const index = this.cardAt(top);
    const card = this.cards[index];
    if (top === card.start) return; // 自然位置的 Query 已在顶部，无需副本。
    // 置顶副本最多占一半高度，且必须给答案留两行（正文 + 底边框）。
    const maxPinnedRows = Math.min(
      body.length - 2,
      Math.max(3, Math.floor(body.length / 2)),
    );
    const pinned = card.query.render(width, maxPinnedRows);
    const nextStart = this.cards[index + 1]?.start ?? Infinity;
    // 标准吸顶位移：下一张 Query 进入视口时，旧副本被逐行顶上去，
    // 而不是被突然覆盖、也不会和新的自然 Query 重复一份。
    const y = Math.min(0, nextStart - top - pinned.length);
    for (let row = Math.max(0, -y); row < pinned.length; row++) {
      body[y + row] = pinned[row];
      ruleRows.delete(y + row);
      if (row === 0 || row === pinned.length - 1) ruleRows.add(y + row);
    }
  }

  /**
   * 渲染一帧。
   *
   * @param width 外层宽度（含左右边框）
   * @returns 不超过 height 行、每行可见宽度都 ≤ width 的行
   */
  render(width: number): string[] {
    if (width < 1) return [];
    // 高度预算：给 pi 的编辑器区留 2 行，且不超过终端高度的 85%。
    const height = Math.max(
      1,
      Math.min(
        this.tui.terminal.rows - 2,
        Math.floor(this.tui.terminal.rows * 0.85),
      ),
    );
    const innerWidth = Math.max(1, width - 2);
    const viewportRows = Math.max(0, height - 3); // 外框上下 + 键位行
    // 先记下视口顶部属于哪张卡片：宽度变化后据此恢复位置，而不是跳回末尾。
    const anchor = this.cardAt(this.scrollView.scrollTop);
    const relativeScroll =
      this.scrollView.scrollTop - (this.cards[anchor]?.start ?? 0);
    let offset = 0;
    // 每帧重算卡片行号：边框颜色、分隔线与吸顶都依赖这份布局。
    const rules = new Set<number>();
    for (const [index, card] of this.cards.entries()) {
      const border = (text: string) =>
        this.theme.fg(index === this.selected ? "accent" : "dim", text);
      card.query.borderStyle = border;
      card.answer.borderStyle = border;
      card.start = offset;
      card.end = offset + card.content.render(innerWidth).length;
      const queryEnd = card.start + card.query.render(innerWidth).length;
      // 四道横向分隔：卡片上沿、Query 下沿、Answer 上沿、卡片下沿。
      for (const row of [card.start, queryEnd - 1, queryEnd, card.end - 1])
        rules.add(row);
      offset = card.end + 1;
    }
    const lines = this.scrollView.render(innerWidth);
    // 让很短的最后一张卡片也能滚到吸顶位置（下方用空白补齐）；
    // clamp 与滚动移动本身仍由 ScrollView 负责。
    const scrollHeight = Math.max(
      lines.length,
      (this.cards.at(-1)?.start ?? 0) + viewportRows,
    );
    this.scrollView.updateLayout(scrollHeight, viewportRows, () =>
      this.tui.requestRender(),
    );
    if (!this.initialized) {
      // 首次打开停在最近一轮。
      this.scrollView.scrollToEnd();
      this.initialized = true;
    } else if (this.width !== width) {
      // 只跟随宽度变化恢复锚点；高度变化交给 clamp。
      this.scrollView.scrollTo(
        (this.cards[anchor]?.start ?? 0) + relativeScroll,
      );
    }
    this.width = width;
    const top = this.scrollView.scrollTop;
    const hints = this.theme.fg(
      "dim",
      bindings
        .map((binding) => binding.hint)
        .filter(Boolean)
        .join("   "),
    );
    const title = "History" + "     " + hints;
    // ui.custom 的 overlay 在两种渲染器里都只接收“扁平的行”，
    // 所以这里自己裁出视口，再在套外框之前合成吸顶 Query。
    const body = lines.slice(top, top + viewportRows);
    while (body.length < viewportRows) body.push("");
    const bodyRules = new Set(
      // 文档坐标 → 视口坐标。
      [...rules]
        .filter((row) => row >= top && row < top + viewportRows)
        .map((row) => row - top),
    );
    this.pinQuery(body, innerWidth, bodyRules);
    const footer = `${Math.min(top + 1, lines.length)}-${Math.min(top + viewportRows, lines.length)} / ${lines.length} 行`;
    // 极矮窗口（连 边框都放不下）时只画外框，不挤掉正文。
    const inside = height > 1 ? [...body] : [];
    // 外框里第 0 行是上边框，内容从 +1 开始，所以 ruleRows 统一偏移。
    return frameLines(
      inside,
      width,
      title,
      footer,
      (text) => this.theme.fg("accent", text),
      new Set([...bodyRules].map((row) => row + 1)),
    )
      .slice(0, height)
      .map((line) => truncateToWidth(line, width));
  }

  /** overlay 挂载后由 history.ts 调用：抢键盘焦点，并在常规模式打开鼠标上报。 */
  activate(handle: OverlayHandle): void {
    handle.focus();
    this.releaseMouse ??= trackHistoryMouse(this.tui);
  }

  /** overlay 关闭时释放鼠标代理；必须幂等（close 与 finally 可能各调一次）。 */
  dispose(): void {
    this.releaseMouse?.();
    this.releaseMouse = undefined;
  }

  /** fullscreen 下的真鼠标事件：滚轮等同 ↑/↓，单击只抢焦点、不重绘。 */
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type === "wheel") {
      const delta = event.wheelDelta ?? 0;
      if (Number.isFinite(delta) && delta !== 0)
        this.act(delta < 0 ? "up" : "down");
      return { handled: true, focus: true, render: delta !== 0 };
    }
    if (event.type === "press")
      return { handled: true, focus: true, render: false };
    return undefined;
  }

  /** 原始输入优先按鼠标滚轮解析，其次才查键位表。 */
  handleInput(data: string): void {
    const action =
      wheelAction(data) ??
      bindings.find((binding) =>
        binding.keys.some((key) => matchesKey(data, key)),
      )?.action;
    if (action) this.act(action);
  }

  /** 所有动作的唯一出口：改完状态后统一请求重绘。 */
  private act(action: Action): void {
    if (action === "close") {
      this.done();
      return;
    }
    if (!this.cards.length) return;
    if (action === "left" || action === "right") {
      this.selected = Math.max(
        0,
        Math.min(
          this.cards.length - 1,
          this.selected + (action === "left" ? -1 : 1),
        ),
      );
      this.scrollView.scrollTo(this.cards[this.selected].start);
    } else if (action === "home") {
      this.selected = 0;
      this.scrollView.scrollToStart();
    } else if (action === "end") {
      this.selected = this.cards.length - 1;
      this.scrollView.scrollToEnd();
    } else {
      this.scrollView.scrollBy(action === "up" ? -1 : 1);
      this.selected = this.cardAt(this.scrollView.scrollTop);
    }
    this.tui.requestRender();
  }

  /** 主题或宽度变化时让子组件重算（本类自己的行号布局在 render 里重建）。 */
  invalidate(): void {
    this.content.invalidate();
  }
}
