/**
 * 常规模式的鼠标上报只在 overlay 存活期间打开。
 *
 * 真正的难点不是开关，而是生命周期：终端挂起/恢复会重走 start/stop，异常退出
 * 走 restoreOnExit。这三条路径都要保证“恢复时重新开启、退出时关闭”，否则关掉
 * overlay 后终端里会残留鼠标转义序列（表现为选中即复制失效、滚轮乱跳）。
 *
 * 全屏模式由 alt-screen 渲染器自己管理鼠标，这里直接跳过。
 */
import type { Terminal, TUI } from "@earendil-works/pi-tui";

/** 1006 = SGR 扩展坐标，1000 = 按键/滚轮上报。 */
const enableMouse = "\x1b[?1000h\x1b[?1006h";
const disableMouse = "\x1b[?1006l\x1b[?1000l";

/**
 * 为 overlay 打开鼠标上报，返回撤销函数（由 HistoryView.dispose 调用）。
 *
 * 实现方式是用 Proxy 包住 terminal，只替换 start / stop / restoreOnExit 三个
 * 生命周期方法；其余成员原样透传并绑定到原对象（ProcessTerminal 依赖私有
 * 状态，不能丢 receiver）。
 */
export function trackHistoryMouse(tui: TUI): () => void {
  if (tui.mode !== "regular") return () => {};
  const terminal = tui.terminal;
  let active = true;
  let enabled = false;
  // 只在真的要写的时候写一次，避免每帧都往终端塞转义序列。
  const enable = () => {
    if (!active || enabled || tui.mode !== "regular") return;
    terminal.write(enableMouse);
    enabled = true;
  };
  const disable = () => {
    if (!enabled) return;
    enabled = false;
    terminal.write(disableMouse);
  };
  const start: Terminal["start"] = (onInput, onResize) => {
    terminal.start(onInput, onResize);
    enable();
  };
  const stop: Terminal["stop"] = () => {
    // 先关上报再停终端，避免 finally 路径漏掉 disable。
    try {
      disable();
    } finally {
      terminal.stop();
    }
  };
  const restoreOnExit: NonNullable<Terminal["restoreOnExit"]> = (
    before,
    after,
  ) => {
    // 退出序列同样要先关鼠标，再交给原实现拼 before/after。
    const prefix = enabled ? disableMouse : "";
    enabled = false;
    if (terminal.restoreOnExit) terminal.restoreOnExit(prefix + before, after);
    else if (prefix) terminal.write(prefix);
  };
  // 完整保留 Terminal 的公开接口；其余方法绑定回原对象以免丢私有状态。
  const tracked = new Proxy(terminal, {
    get(target, key) {
      if (key === "start") return start;
      if (key === "stop") return stop;
      if (key === "restoreOnExit") return restoreOnExit;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  enable();
  tui.terminal = tracked;
  // 撤销：停用后不再重新开启，并把 tui.terminal 换回原对象（幂等）。
  return () => {
    active = false;
    try {
      disable();
    } finally {
      if (tui.terminal === tracked) tui.terminal = terminal;
    }
  };
}
