# Commands

When to read: building, running, or checking the project.

Prereqs: Node 22+, and a `config.yaml` in the CWD you start from.

| Action | Command |
| ------ | ------- |
| Install | `npm install` |
| Dev (watch) | `npm run dev` |
| Build | `npm run build` |
| Run built | `npm start` |
| Typecheck | `npm run typecheck` |

- **Dev**: nodemon watches `src`, runs `tsx src/main`.
- **Build**: tsup bundles `src/main.ts` → `dist/main.js` (ESM, node22, single file,
  sourcemaps; `clean: true`).
- **Run built**: `node dist/main.js` — requires a prior `npm run build`.

Gotchas:
- No test script and no lint script exist. Prettier is configured
  (`.prettierrc.json`, tabs) but not wired to a script; format manually with
  `npx prettier -w .` if needed.
- `config.yaml` is gitignored, so a fresh clone will not start until you create one.
