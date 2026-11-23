/**
 * 两级别框线：
 *
 * - HistoryFrame 给单张卡片套框，并能在“吸顶副本”里按行数上限裁剪；
 * - frameLines 给整个视口套外层框，并把卡片接缝处的 │ 换成 ├/┤。
 *
 * 为什么要手写：pi-tui 的 Box 只负责 padding / 背景，没有边框选项，而这里
 * 需要的正是可拼接的横向分隔线。
 */
import {
  truncateToWidth,
  visibleWidth,
  type Component,
} from "@earendil-works/pi-tui";

/** 边框着色函数；默认不着色，视图层注入按选中状态取色的实现。 */
type BorderStyle = (text: string) => string;
const plain: BorderStyle = (text) => text;

/**
 * 把一段已渲染好的行包进矩形框。
 *
 * @param lines    内容行；每行会被裁到 innerWidth（含 ANSI 安全折行）
 * @param width    含左右边框的总宽度
 * @param title    上边框里的标题（空则整行横线）
 * @param footer   下边框里的页脚（空则整行横线）
 * @param style    边框着色
 * @param ruleRows 需要用 ├/┤ 而非 │ 的行号（内容坐标），用于卡片接缝
 */
export function frameLines(
  lines: readonly string[],
  width: number,
  title = "",
  footer = "",
  style: BorderStyle = plain,
  ruleRows: ReadonlySet<number> = new Set(),
): string[] {
  if (width < 1) return [];
  const innerWidth = Math.max(0, width - 2);
  // 上下边框：左侧留一个空格再写字，剩余宽度用 ─ 补满。
  const edge = (left: string, right: string, label: string) => {
    const text = truncateToWidth(label ? ` ${label} ` : "", innerWidth, "");
    return style(
      truncateToWidth(
        `${left}${text}${"─".repeat(innerWidth - visibleWidth(text))}${right}`,
        width,
        "",
      ),
    );
  };
  return [
    edge("╭", "╮", title),
    ...lines.map(
      (line, row) =>
        style(ruleRows.has(row) ? "├" : "│") +
        (width > 1
          ? truncateToWidth(line, innerWidth, "", true) +
            style(ruleRows.has(row) ? "┤" : "│")
          : ""),
    ),
    edge("╰", "╯", footer),
  ];
}

/**
 * 单张卡片的框：标题栏 + 内容 + 底边。
 *
 * render() 的可选 maxRows 用于“吸顶副本”：空间不够时裁剪正文并在末行加
 * 省略号；连两行边框都放不下时退化成一行摘要（极窄窗口）。
 */
export class HistoryFrame implements Component {
  /** 由视图层每帧更新，用于选中高亮。 */
  borderStyle: BorderStyle = plain;
  private readonly child: Component;
  private readonly title: string;

  constructor(child: Component, title: string) {
    this.child = child;
    this.title = title;
  }

  /**
   * @param maxRows 行数上限；undefined 表示完整渲染（文档里那份）
   */
  render(width: number, maxRows?: number): string[] {
    const innerWidth = Math.max(1, width);
    // 只画横向的标题栏/底栏：左右竖线由外层 frameLines 提供。
    const rule = (label = "") => {
      const text = truncateToWidth(label ? `─ ${label} ` : "", width, "");
      return this.borderStyle(
        text + "─".repeat(Math.max(0, width - visibleWidth(text))),
      );
    };
    let lines = this.child.render(innerWidth);
    if (maxRows !== undefined && maxRows < 3) {
      // 连“标题栏 + 一行内容 + 底边”都放不下，就无法同时保住提问和回答。
      // 此时只留一行提问摘要，完整内容仍在文档里可通过滚动查看。
      return maxRows > 0
        ? [rule(`${this.title}: ${lines[0]?.trim() ?? ""}`)]
        : [];
    }
    // 只裁剪吸顶副本，文档里的完整提问不受影响。
    if (maxRows !== undefined && lines.length + 2 > maxRows) {
      const bodyRows = Math.max(0, maxRows - 2);
      lines = lines
        .slice(0, bodyRows)
        .map((line, index) =>
          index === bodyRows - 1
            ? truncateToWidth(`${line.trimEnd()} …`, innerWidth)
            : line,
        );
    }
    const framed = [rule(this.title), ...lines, rule()];
    return maxRows === undefined
      ? framed
      : framed.slice(0, Math.max(0, maxRows));
  }

  /** 主题或宽度变化时清掉子组件的渲染缓存。 */
  invalidate(): void {
    this.child.invalidate();
  }
}
