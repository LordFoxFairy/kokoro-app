# data-management - account data projection

## Responsibility

Typed browser boundary for the Settings data-management surface. It reads only the current host/session actor projection; it does not own artifacts, tenant resolution, credentials, or browser storage contents.

## Public API

- `DataManagementClient` and `createDataManagementClient()` in `client.ts`.
- `DataManagementSummary` plus typed shared-task/file/archive/app/site records.
- Same-origin base: `/api/settings/data-management`.

All inbound JSON is parsed with strict Zod resource schemas. The common envelope explicitly accepts `ok` and `request_id`; unknown resource fields fail loudly.

## Constraints

- The browser never sends `tenant_id` or `site_id`.
- Authorized-app credentials, Cookie values, tokens, and browser storage payloads never enter this contract.
- Artifact Library remains in the Session domain and must not be imported here.
