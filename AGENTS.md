# Cluster News

## Scope
- Lightweight Next.js news reader for the local cluster.
- Keep the app small, server-rendered, and easy to run locally.

## Local Development
- Install with `npm install`.
- For normal local runs:
  - `npm run dev`
- For production verification:
  - `npm run build && npm run start`

## App Rules
- Prefer Next.js App Router with server components and plain CSS over client-heavy patterns.
- Keep ingestion simple: RSS/Atom feeds first, light metadata extraction only.
- Preserve SQLite as the default persistence layer unless a larger data model is needed.

## Helm And Releases
- If a PR changes anything under `chart/`, bump `chart/Chart.yaml` `version` in the same PR.
- Bump `appVersion` when the deployed app behavior meaningfully changes.

## Verification
- Run `npm run lint`, `npm test`, and `npm run build` for app changes.
- Run `helm template cluster-news ./chart` for chart changes.
