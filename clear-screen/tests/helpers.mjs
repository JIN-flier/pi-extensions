import { initTheme } from "@earendil-works/pi-coding-agent";
import { Container, Text } from '@earendil-works/pi-tui';

initTheme('dark', false);

export class MemoryTerminal {
  columns = 100;
  rows = 40;
  kittyProtocolActive = false;
  writes = [];
  start(onInput) { this.onInput = onInput; }
  input(data) { this.onInput?.(data); }
  stop() {}
  write(data) { this.writes.push(data); }
  moveBy() {}
  hideCursor() {}
  showCursor() {}
  clearLine() {}
  clearFromCursor() {}
  clearScreen() { this.write('\x1b[2J\x1b[H'); }
  setTitle() {}
  setProgress() {}
  setProgramStatus() {}
}
export const theme = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: text => text,
};
export function hostLayout(tui) {
  const document = new Container();
  for (const label of ['header', 'resources', 'transcript']) {
    const section = new Container();
    section.addChild(new Text(label));
    document.addChild(section);
  }
  tui.addChild(document);
  for (const label of ['pending', 'status', 'above', 'editor', 'below', 'footer']) {
    const section = new Container();
    section.addChild(new Text(label));
    tui.addChild(section);
  }
  return document;
}
export function harness(tui, entries = []) {
  const result = { component: undefined, closed: 0, notices: [] };
  result.ctx = {
    mode: 'tui',
    sessionManager: { getBranch: () => entries },
    ui: {
      notify: (...args) => result.notices.push(args),
      custom: async factory => {
        result.component = await factory(tui, theme, {}, () => { result.closed++; });
      },
    },
  };
  return result;
}
export const entry = (role, content) => ({
  type: 'message', id: 'test', parentId: null, timestamp: '2026-11-22T00:00:00Z',
  message: { role, content, timestamp: 0 },
});
