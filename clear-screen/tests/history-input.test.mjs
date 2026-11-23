import assert from 'node:assert/strict';
import test from 'node:test';
import { Text, TuiMainScreen, TuiAltScreen } from '@earendil-works/pi-tui';
import { showHistory } from '../src/history.ts';
import { MemoryTerminal, entry, theme } from './helpers.mjs';

for (const Renderer of [TuiMainScreen, TuiAltScreen]) {
  test(`${Renderer.name}: mounted overlay owns focus, routes wheel like arrow keys, and restores editor on close`, async () => {
    const terminal = new MemoryTerminal();
    terminal.rows = 24;
    const tui = new Renderer(terminal);
    const editor = new Text('editor');
    const editorInput = [];
    editor.handleInput = data => editorInput.push(data);
    tui.addChild(editor);
    tui.setFocus(editor);
    let component;
    let overlay;
    let closes = 0;
    try {
      tui.start();
      await showHistory({
        mode: 'tui',
        sessionManager: { getBranch: () => [
          entry('user', 'WHEEL_QUERY'),
          entry('assistant', [{type: 'text', text: Array.from({length: 50}, (_, i) => `reply ${i}`).join('\n\n')}]),
        ] },
        ui: {
          custom: async (factory, options) => {
            component = factory(tui, theme, {}, () => {
              overlay.hide();
              component.dispose?.();
              closes++;
            });
            overlay = tui.showOverlay(component, options.overlayOptions);
            options.onHandle?.(overlay);
          },
        },
      });
      tui.renderNow();
      assert.equal(tui.getFocusedComponent(), component);
      terminal.input('\x1b[H');
      tui.renderNow();
      const initial = component.render(88);
      terminal.input('\x1b[B');
      const afterDown = component.render(88);
      terminal.input('\x1b[A');
      terminal.input('\x1b[<65;50;12M');
      const afterWheel = component.render(88);
      assert.deepEqual(afterWheel, afterDown);
      terminal.input('\x1b[<64;50;12M');
      assert.deepEqual(component.render(88), initial);
      assert.deepEqual(editorInput, []);
      if (tui.mode === 'regular') assert.ok(terminal.writes.join('').includes('\x1b[?1000h'));
      terminal.writes.length = 0;
      terminal.input('\x1b');
      assert.equal(closes, 1);
      assert.equal(tui.getFocusedComponent(), editor);
      if (tui.mode === 'regular') assert.ok(terminal.writes.join('').includes('\x1b[?1000l'));
      else assert.ok(!terminal.writes.join('').includes('\x1b[?1000l'), 'fullscreen mouse handling belongs to renderer');
    } finally {
      overlay?.hide();
      component?.dispose?.();
      tui.stop();
    }
  });
}

test('regular-mode mouse tracking follows terminal stop, resume, and exit restoration', async () => {
  const terminal = new MemoryTerminal();
  terminal.restoreOnExit = (before, after) => terminal.write(before + after);
  const tui = new TuiMainScreen(terminal);
  let component;
  let overlay;
  try {
    tui.start();
    await showHistory({
      mode: 'tui', sessionManager: { getBranch: () => [entry('user', 'query')] },
      ui: { custom: async (factory, options) => {
        component = factory(tui, theme, {}, () => {});
        overlay = tui.showOverlay(component, options.overlayOptions);
        options.onHandle?.(overlay);
      } },
    });
    terminal.writes.length = 0;
    tui.stop();
    assert.match(terminal.writes.join(''), /\x1b\[\?1000l/);
    terminal.writes.length = 0;
    tui.start();
    assert.match(terminal.writes.join(''), /\x1b\[\?1000h/);
    terminal.writes.length = 0;
    tui.terminal.restoreOnExit('before', 'after');
    assert.match(terminal.writes.join(''), /\x1b\[\?1000l/);
    assert.match(terminal.writes.join(''), /beforeafter/);
    component.dispose();
    assert.equal(tui.terminal, terminal, 'dispose restores the original terminal');
    terminal.writes.length = 0;
    tui.stop(); tui.start();
    assert.ok(!terminal.writes.join('').includes('\x1b[?1000h'), 'closed history never re-enables tracking');
  } finally {
    overlay?.hide();
    component?.dispose?.();
    tui.stop();
  }
});
