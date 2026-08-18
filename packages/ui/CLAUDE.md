# @reporter/ui — component guide

The reporter design system. Owned by the `ux-ui` agent; the contract is `DESIGN.md`.

## What ships here

- `src/tokens.css` — CSS-variable design tokens (light + dark).
- `src/theme.css` — Tailwind v4 entry that imports tokens and maps them to theme variables (`bg-surface`, `text-muted`, `text-accent`, `rounded-card`, …). Consumers import `@reporter/ui/theme.css`.
- React primitives (`.tsx`), token-based only.

## Primitives available now

`ThemeProvider` / `useTheme`, `Button`, `Spinner`, `Input` / `Textarea` / `Field`, `Card` (+ `CardHeader`/`CardBody`), `Badge`, `TagChip`, `TagPicker`, `EmptyState`, `ErrorState`, `Modal` (focus-trapped, Esc-close), `ConfirmProvider` / `useConfirm` (themed promise-based confirm), `ToastProvider` / `useToast`, `Select`, `Checkbox`, `Table` (+ `Thead`/`Tbody`/`Tr`/`Th`/`SortableTh`/`Td`), `Tabs`, `cn`.

## Still to add if needed

`DateRangePicker` (structured date-range filter for the timeline query builder). Add it **here**, not inline in an app.

## Rules

- No raw hex, no arbitrary spacing/px. Everything resolves to tokens / the Tailwind scale.
- `react`/`react-dom` are peer deps. Keep components presentational; no data fetching.
- Tag colors come from `@reporter/shared` `TAG_COLORS` — never redefine a palette here.
