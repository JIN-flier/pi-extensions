# pi-extensions

Monorepo for my [Pi](https://pi.dev) agent extensions. Dependencies are installed **once** at the repo root via npm workspaces; each package keeps its own `package.json` (name, `pi` manifest, scripts) but no `node_modules`.

## Layout

| Workspace        | Package name      | What it does                                        |
| ---------------- | ----------------- | --------------------------------------------------- |
| `anydoc-reader/` | `anydoc-read`     | `anydoc_convert` / `anydoc_formats` tools + skill    |
| `clear-screen/`  | `clear-command`   | `/clear` and `/history` commands                    |
| `model-picker/`  | `pi-daily-report` | `/model-picker` peak/off-peak model selection        |

## Setup

```bash
npm install     # once, at the repo root
```

## Common commands

```bash
npm run typecheck                 # every workspace
npm run test                      # every workspace
npm run check                     # typecheck + test

npm run dev -w clear-command      # pi -e ./src/index.ts in one workspace
npm run typecheck -w anydoc-read  # one workspace
```

## How dependency resolution works

`node_modules/` lives only at the repo root. Pi loads a local extension by absolute path (`pi -e ./clear-screen/src/index.ts`, `pi install ./anydoc-reader`) without installing anything, and Node resolves imports by walking up from the extension file — so `@firecrawl/anydoc` and other runtime dependencies are found in the root `node_modules`.

Rules that keep this working:

- Do **not** run `npm install` inside a workspace directory; it creates a second, drifting `node_modules` and lockfile.
- Keep a single `package-lock.json`, at the root, and commit it.
- Host-provided packages (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `typebox`) are declared in each package's `peerDependencies` as `"*"` and installed only at the root as `devDependencies`, for typechecking. Never put them in `dependencies`.
- Real runtime dependencies go in the consuming package's `dependencies`; npm hoists them to the root `node_modules`.
- Shared tooling (TypeScript, types, ESLint, Prettier) is pinned once in the root `devDependencies`; keep versions aligned across packages so npm does not nest duplicates.

## Notes

- `daily-report/` is not a workspace (it currently only contains a copied `package.json`).
- `clear-screen`'s tests import two deep host files that the package's `exports` map hides; they resolve the host package through Node instead of a hardcoded `./node_modules` path so they keep working with hoisted dependencies.
