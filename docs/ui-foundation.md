# Kokoro User Web UI Foundation

## Boundary

`src/components/ui` is the only primitive layer. `src/components/blocks` owns reusable product composition, while the current independent Site repository owns site-specific layout and product behavior in `src/features`. A block may use a CSS Module for geometry, responsive layout, and skin-specific illustration details; it must not redefine the shadcn surface palette or overlay/focus behavior. CSS Modules 的细分边界见 [ui-css-modules.md](./ui-css-modules.md)。

## Tokens

`src/app/globals.css` owns the shadcn semantic contract:

- surfaces: `background`, `card`, `popover`, `secondary`, `muted`, `accent`
- content: `foreground`, `*-foreground`, `muted-foreground`
- actions: `primary`, `primary-foreground`, `ring`, `destructive`
- structure: `border`, `input`
- shape: `radius`, `radius-sm`, `radius-md`, `radius-lg`, `radius-xl`, `radius-2xl`
- elevation: `shadow-xs`, `shadow-sm`（仅用于轻量层级，不在 CSS Module 内自建阴影色板）
- domain status: `success`, `warning`, `error`, `neutral` and their `*-bg`/`*-border` forms

Runtime site skin configuration uses the same token names as keys (`primary`, `background`, `card`, etc.). The browser accepts only these semantic keys and writes `--${key}` directly; there is no legacy palette or alias mapping.

## Composition rules

- `Dialog`, `Sheet`, `Popover`, and `DropdownMenu` own portal, stacking, focus, keyboard, and positioning behavior.
- `SidebarProvider` owns the responsive sidebar state. The workspace supplies only the shell width contract.
- The User Web shell contract is `>767px` for the fixed shadcn rail (including compact browser/zoomed Web windows); only `<=767px` enters the phone Sheet path. `src/hooks/use-mobile.ts`, AppFrame, shell CSS, and rail CSS must share this boundary.
- `Tabs`, `ToggleGroup`, `Select`, `Field`, `Input`, `Textarea`, `Checkbox`, `Switch`, `Card`, `Empty`, `Alert`, `AlertDialog`, `Skeleton`, `Spinner`, and `Button` are the default building blocks.
- Tab 导航必须由真实的 `TabsContent` 承接（`aria-controls` 不得指向虚构节点）；使用 shadcn `ScrollArea` 时只让 viewport 承担滚动，业务面板不得再包第二个主滚动容器。
- The workspace shell exposes an `emptyState` slot. The shell owns draft/focus/submit behavior; each site owns its welcome copy and visual composition. A site may set `emptyStateOwnsComposer` to place the shell-owned Composer inside its empty-state composition without creating a second editor. The Kokoro desktop skin follows the Manus-aligned chat grammar (`project header → centered welcome → Composer → compact prompt starters → task feed`); persistent project configuration is reached through navigation/Settings, not duplicated as setup cards in the first chat surface.
- An empty active session is not a “recent conversation”: the rail must suppress its synthetic placeholder row until the session has a message or an explicit title. This keeps the first-run surface visually empty while retaining the active session in the shell state.
- The active conversation route is a shell contract (`chatHref`), not a hard-coded package route. Preview, live, and independently deployed sites may point the same rail at different route roots.
- The active conversation view is also addressable with an opaque `?conversation=<session_id>` parameter. Selecting a conversation and starting a new one update that parameter with `history.pushState` without a document navigation; the initial deep link and the first message use `replaceState` so refresh/back-forward restore the same view without polluting history. The parameter never carries tenant/site identity.
- The shell fallback is only the neutral shadcn `Empty` composition. It is not a product welcome screen and must not grow site-specific cards, prompts, or navigation; a site that needs a real first-run surface must provide the `emptyState` slot.
- The desktop Canvas is a resizable third column, so its header uses CSS container queries in addition to the mobile viewport breakpoint. Components must respond to the width they actually receive, not only to `window.innerWidth`.
- The Composer follows the same rule: model/agent/mode controls wrap from the Composer container width when the Canvas reduces the main column, while preserving the send action and focus ring.
- Live runtime-manifest failure is a shell gate, not a theme fallback: `AppGate`, `HomeGate`, and `LoginPanel` render the shared shadcn `RuntimeUnavailable` surface and expose an explicit retry action.
- CSS Modules do not add overlay `z-index`, duplicate modal backdrops, or custom positioning for Radix content.
- Dynamic values such as rail width, canvas width, and progress width are the only inline styles allowed in product code.
- Controlled overlays receive an optional shell scope for fallback focus recovery; document-wide queries must not move focus into another independently mounted Site Web instance.
