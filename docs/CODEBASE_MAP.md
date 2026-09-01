# Kokoro User Web Codebase Map

## Runtime shell

- `src/app/app/layout.tsx`: mounts the single User Web application shell.
- `src/app/app/*/page.tsx`: route entry shells for mounted desktop surfaces.
- `src/features/app/kokoro-app-surface.tsx`: keeps the desktop shell mounted while projecting the active surface.
- `src/components/blocks/app-frame/app-frame.tsx`: rail, header, conversation state, settings overlays, and shared Composer wiring.
- `src/components/blocks/workspace-rail/`: desktop rail, resize, navigation, and session list.

## Feature surfaces

- `src/features/app/kokoro-welcome.tsx`: direct-chat welcome and creation-mode surface.
- `src/features/app/kokoro-project-workspace.tsx`: project overview and project chat surface.
- `src/features/app/kokoro-agents-surface.tsx`: Agent landing surface and setup flow.
- `src/features/app/kokoro-library-surface.tsx`: library surface.
- `src/features/app/kokoro-scheduled-surface.tsx`: scheduled-task surface.
- `src/features/app/kokoro-skills-surface.tsx`: skills surface and detail/import flows.
- `src/features/app/kokoro-plugins-surface.tsx`: connector/MCP surface.

## Reusable UI

- `src/ui/composer/`: Composer, menus, creation-intent capsule, and voice controller.
- `src/ui/settings/`: settings modal and tab panels.
- `src/ui/skills/`: skill cards, detail dialog, upload, and GitHub import.
- `src/ui/library/`: library panels and artifact previews.
- `src/ui/scheduled/` and `src/components/blocks/`: scheduling dialog and project controls.
- `src/components/ui/`: shadcn/Radix primitives and the shared token layer.

## Data and contracts

- `src/contract/http.ts`: typed HTTP response/request shapes.
- `src/agents/`, `src/system/`, `src/lib/`: preview/live adapters, runtime manifest, and shared utilities.
- `src/app/api/`: local BFF/fixture routes; feature clients should keep canonical paths typed and isolated.
- `docs/integration/`: backend Web contracts and mock-fixture matrix.
- `docs/integration/chat-handoff-contract-v1.md`: Direct Chat ↔ Project Chat route, draft handoff, and shared Session contract.
- `contract/README.md`: checked-in runtime contract source policy; there is no implicit generator or missing `contract/spec` dependency.

## Verification

- `tests/ui/`: component and interaction tests.
- `output/playwright/`: same-viewport visual evidence; use desktop Web only.
- Required gates: `pnpm lint`, `pnpm test`, `pnpm typecheck`, `pnpm build`.

## Editing rules for parallel work

- Preserve the mounted desktop shell and do not modify mobile presentation without explicit authorization.
- Prefer shadcn/Radix/Lucide primitives and colocated CSS Modules.
- Use synthetic fixture data; never copy reference-site credentials, cookies, tokens, or protected assets.
- Keep feature-specific CSS out of shared Composer/rail modules unless the contract is genuinely shared.
