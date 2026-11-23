# Clear Command Extension

Pi extension for clearing visible output and browsing the current branch's Q&A history.

## Requirements and installation

- Node.js 22.19 or later
- `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` 1.6.x

This extension lives in the `pi-extensions` monorepo, so dependencies are installed once at the repo root:

```bash
npm install          # at the repo root
npm run dev -w clear-command
# Or load it from another directory:
pi -e /absolute/path/to/pi-extensions/clear-screen/src/index.ts
```

## Commands

- `/clear` (alias `/cls`): clears the visible header, resource notices, and transcript. Session history and model context remain intact; editor, footer, widgets, and pending messages stay mounted.
- `/history`: opens an overlay showing Q&A from the current session branch. Thinking, tool calls, and tool results are hidden. Image attachments are represented by their count, and image-only questions remain separate turns.

The history overlay is titled `History`. Query and Assistant sections share its outer vertical borders and are separated by horizontal rules. The footer shows only the line counter. Assistant content uses Pi's native Markdown renderer and theme, including code highlighting; Query text stays literal. The current Query stays pinned below the key hints while scrolling; the next Query pushes it out as it arrives. Very long queries use a shortened pinned copy so answers remain readable; their full text stays in the scrolling document. Very short windows use a one-line pinned summary, or ordinary scrolling when there is not enough room for both the query and answer.

Both commands require TUI mode. `/clear` supports regular and fullscreen rendering. Regular mode also clears terminal scrollback; fullscreen mode redraws its own viewport without clearing the shell's main-screen scrollback.

History controls:

| Key | Action |
| --- | --- |
| Esc / Ctrl+C | Close |
| ↑ / ↓ or mouse wheel | Scroll one line |
| ← / → | Select previous / next Q&A |
| Home / End | Go to the beginning / end |

Opening history focuses the overlay; closing it restores the editor focus. Regular mode enables mouse reporting while the overlay is open and restores it across terminal stop/resume and exit. Fullscreen mode uses Pi's existing mouse handling.

## Compatibility

Pi does not expose a transcript-container accessor. The clear command therefore validates the known Pi 1.6 seven-region layout and its three-section document before clearing anything. Unknown or ambiguous layouts produce a warning and are left untouched. The peer ranges are deliberately limited to the reviewed 1.6 series; review this adapter before widening them.

History uses Pi's `Text`, `Markdown`, `Container`, and `ScrollView`, with a shared outline component because Pi's `Box` has no border option. A small viewport adapter clips the scroll view and composites the pinned query for `ui.custom`, whose overlays accept flat rendered lines in both rendering modes.

## Development

```bash
npm test
npm run typecheck
```

Tests cover both real Pi renderers using an in-memory terminal, unknown layouts, message grouping, keyboard and mouse input, focus restoration, terminal mouse lifecycle, shared borders, native Markdown, sticky query transitions, long queries, and terminal resizing. They do not replace an interactive check in a real terminal emulator.

## Acknowledgement

Inspired by [pi-clear-screen](https://github.com/zliu250/pi-extensions).

## License

MIT
