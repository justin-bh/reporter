# @reporter/ui — component guide

The reporter design system. Owned by the `ux-ui` agent; the contract is `DESIGN.md`.

## What ships here

- `src/tokens.css` — CSS-variable design tokens (light + dark).
- `src/theme.css` — Tailwind v4 entry that imports tokens and maps them to theme variables (`bg-surface`, `text-muted`, `text-accent`, `rounded-card`, …). Consumers import `@reporter/ui/theme.css`.
- React primitives (`.tsx`), token-based only.

## Primitives available now (Phase 0)

`ThemeProvider` / `useTheme`, `Button`, `Spinner`, `Input` / `Textarea` / `Field`, `Card` (+ `CardHeader`/`CardBody`), `Badge`, `TagChip`, `EmptyState`, `cn`.

## To add in Phase 2 (when the web app needs them)

`Modal` (focus-trapped, Esc-close), `Toast` + `useToast`, `Table`, `Select`, `Checkbox`, `Tabs`, `TagPicker`, `DateRangePicker`. Add them **here**, not inline in an app.

## Rules

- No raw hex, no arbitrary spacing/px. Everything resolves to tokens / the Tailwind scale.
- `react`/`react-dom` are peer deps. Keep components presentational; no data fetching.
- Tag colors come from `@reporter/shared` `TAG_COLORS` — never redefine a palette here.
