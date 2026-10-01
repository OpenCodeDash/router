# Conventions

When to read: adding or moving files, or matching existing code style.

- Indentation: **tabs** (`.prettierrc.json`).
- ESM only (`"type": "module"`); relative imports include the `.ts` extension
  (tsconfig `rewriteRelativeImportExtensions`).
- Import aliases (tsconfig `paths`; tsup bundles them, so no runtime `imports` field is
  needed):
  - `#c/*` → `src/const/*.const.ts`
  - `#t/*` → `src/type/*.type.ts`
  - `#s/*` → `src/schema/*.schema.ts`
- File-name suffixes: `<name>.const.ts`, `<name>.type.ts`, `<name>.schema.ts`.
- Schemas use Zod and export both `XSchema` and `export type X = z.infer<typeof XSchema>`
  (see `src/schema/`). Compose objects/unions from files under `src/schema/` (the event
  union is the example).
- Runtime state is plain classes — `ModelManager`, `EventManager`, `TimetableManager`,
  `Router`; no DI framework.
- Client errors must go through `sendError(reply, status, message, type?, code?)` in
  `src/util.ts`; don't hand-roll error bodies.
- Custom Zod checks use `.refine` (see `isValidCron` in `src/util.ts`).
