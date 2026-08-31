# ui/data-management - Settings data controls

## Responsibility

Manus-aligned Settings content for the data-management summary, authorized applications, and cloud-browser data. The parent Settings Dialog owns overlay, navigation, and scrolling; this directory owns only the content views and their local transitions.

## Public API

- `DataManagementContent({ client })` in `data-management-panel.tsx`.
- `DataManagementView`: `summary | authorized-apps | cloud-browser`.

## Runtime behavior

- Summary and child views share one mounted Settings Dialog.
- Child views update `#/account/settings/library/*`; `popstate` restores the view.
- Cloud-browser persistence uses an optimistic shadcn `Switch`, then reconciles to the server response and rolls back on failure.
- Empty preview data is explicit fixture state, not fabricated account data.

## Dependencies

Uses the typed `@/data-management/client` boundary and existing shadcn Button, Switch, Separator, and Skeleton primitives. Styling is local to `data-management-panel.module.css`.
