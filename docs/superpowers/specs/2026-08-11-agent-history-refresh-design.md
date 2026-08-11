# Agent history refresh

## Goal

Make the workspace-scoped history in the Agents panel useful without manual
loading or re-running a search, while preserving its bounded local-disk read.

## History loading behavior

- When an Agents panel is displayed for a configured provider, load its
  bounded, most-recent history automatically.
- When the workspace or selected provider changes, invalidate any previous
  request and load the bounded history for the new context.
- Keep the visible result during a subsequent refresh or search so the panel
  does not flash back to an empty, idle state.
- Retain the refresh button as an explicit immediate retry/refresh action. It
  uses the current workspace, provider, and normalized search query.

## Search behavior

- A non-empty search automatically issues a history query after a short
  debounce (250 ms).
- Clearing the search automatically reloads the default most-recent history.
- Request generations continue to reject stale asynchronous responses, so a
  slow earlier query cannot replace a newer context or search result.

## Bounds and failures

- The renderer continues to use the existing main-process history query,
  which applies its default capped result count and provider/workspace
  filtering. No complete transcript or unbounded history is loaded.
- Loading status is shown without discarding prior items. A failed automatic
  or manual refresh presents the existing generic error state and permits
  retry through the refresh control.

## Tests

- Add focused component/source coverage for automatic initial loading,
  debounced search refreshes, and context-change invalidation.
- Preserve utility and main-process history tests that enforce provider,
  workspace, input-validation, and bounded-result behavior.
- Run the affected tests, `npx tsc --noEmit`, `npm test`, and `npm run build`.
