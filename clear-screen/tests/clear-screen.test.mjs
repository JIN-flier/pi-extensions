import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Container, Text, TuiMainScreen, TuiAltScreen } from '@earendil-works/pi-tui';
import { clearScreen } from '../src/clear-screen.ts';

// Resolve the host package through Node instead of a hardcoded
// ./node_modules path, so the tests work whether dependencies are installed
// locally or hoisted to a monorepo root.
const hostRoot = dirname(dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'))));
const hostImport = (relativePath) => pathToFileURL(resolve(hostRoot, relativePath)).href;

// Characterize the Pi 1.6 host adapter against its real proxy and layout root.
// These files are not in the package's `exports`, so import them by absolute URL.
const { createInteractiveTuiReference } = await import(hostImport('dist/modes/interactive/tui-renderer.js'));
const { createChatViewport } = await import(hostImport('dist/modes/interactive/chat-viewport.js'));
import { MemoryTerminal, harness, hostLayout } from './helpers.mjs';

test('unrecognized containers are never cleared', async () => {
  const terminal = new MemoryTerminal();
  const tui = new TuiMainScreen(terminal);
  const editor = new Container();
  const nestedEditor = new Container();
  nestedEditor.addChild(new Text('draft'));
  editor.addChild(nestedEditor);
  tui.addChild(editor);
  const h = harness(tui);
  await clearScreen(h.ctx);
  assert.equal(nestedEditor.children.length, 1);
  assert.equal(terminal.writes.length, 0);
  assert.equal(h.notices[0][1], 'warning');
  assert.equal(h.closed, 1);
});

for (const Renderer of [TuiMainScreen, TuiAltScreen]) {
  test(`${Renderer.name} clears transcript and preserves all other regions`, async () => {
    const terminal = new MemoryTerminal();
    const tui = new Renderer(terminal);
    const document = hostLayout(tui);
    const before = tui.children.slice(1).map(c => c.render(80));
    const h = harness(tui);
    await clearScreen(h.ctx);
    assert.deepEqual(document.children.map(c => c.children.length), [0, 0, 0]);
    assert.deepEqual(tui.children.slice(1).map(c => c.render(80)), before);
    assert.equal(h.closed, 1);
    assert.deepEqual(h.notices, []);
    if (tui.mode === 'fullscreen') {
      assert.ok(!terminal.writes.join('').includes('\x1b[3J'), 'must not erase main screen scrollback');
    } else {
      assert.ok(terminal.writes.includes('\x1b[3J'));
      assert.equal(tui.captureRenderState().maxLinesRendered, 0);
    }
  });
}

for (const change of ['extra-region', 'ambiguous-document', 'aliased-section']) {
  test(`rejects ${change} without modifying any region`, async () => {
    const terminal = new MemoryTerminal();
    const tui = new TuiMainScreen(terminal);
    const document = hostLayout(tui);
    if (change === 'extra-region') tui.addChild(new Container());
    if (change === 'ambiguous-document') {
      tui.children[4].clear();
      for (let i = 0; i < 3; i++) tui.children[4].addChild(new Container());
    }
    if (change === 'aliased-section') document.children[2] = tui.children[4];
    const before = tui.render(80);
    const h = harness(tui);
    await clearScreen(h.ctx);
    assert.deepEqual(tui.render(80), before);
    assert.equal(terminal.writes.length, 0);
    assert.equal(h.notices[0][1], 'warning');
  });
}

test('terminal failures are reported and do not resolve the custom factory as successful', async () => {
  const terminal = new MemoryTerminal();
  terminal.write = () => { throw new Error('disconnected'); };
  const tui = new TuiMainScreen(terminal);
  hostLayout(tui);
  const h = harness(tui);
  await clearScreen(h.ctx);
  assert.equal(h.closed, 0);
  assert.equal(h.notices[0][1], 'error');
  assert.match(h.notices[0][0], /disconnected/);
});

for (const mode of ['print', 'json', 'rpc']) {
  test(`/clear declines ${mode} without opening custom UI`, async () => {
    const h = harness(new TuiMainScreen(new MemoryTerminal()));
    h.ctx.mode = mode;
    await clearScreen(h.ctx);
    assert.equal(h.component, undefined);
    assert.equal(h.notices[0][1], 'warning');
  });
}

for (const Renderer of [TuiMainScreen, TuiAltScreen]) {
  test(`${Renderer.name} actually redraws after clearing`, async () => {
    const terminal = new MemoryTerminal();
    const tui = new Renderer(terminal);
    hostLayout(tui);
    if (tui.mode === 'fullscreen') {
      const [document, pendingMessages, status, widgetsAbove, editor, widgetsBelow, footer] = tui.children;
      tui.setLayoutRoot(createChatViewport({
        document, pendingMessages, status, widgetsAbove, editor, widgetsBelow, footer, scrollbar: 'hidden',
      }).root);
    }
    const reference = createInteractiveTuiReference(() => tui);
    try {
      tui.start();
      tui.renderNow();
      terminal.writes.length = 0;
      await clearScreen(harness(reference).ctx);
      tui.renderNow();
      const output = terminal.writes.join('');
      assert.ok(output.includes('editor'));
      assert.ok(output.includes('footer'));
      assert.ok(!output.includes('transcript'));
    } finally { tui.stop(); }
  });
}
