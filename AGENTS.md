# Cluster News

## Scope
- Lightweight Flask news reader for the local cluster.
- Keep the app small, server-rendered, and easy to run locally.

## Local Development
- Use the existing virtualenv at `.venv` when available.
- For normal local runs:
  - `.venv/bin/python app.py`
- For rapid UI iteration:
  - `.venv/bin/python -m flask --app app:create_app --debug run --host 0.0.0.0 --port 8080`

## App Rules
- Prefer direct Flask templates and plain CSS over frontend tooling.
- Keep ingestion simple: RSS/Atom feeds first, scraping only if explicitly requested.
- Preserve SQLite as the default persistence layer unless a larger data model is needed.

## Helm And Releases
- If a PR changes anything under `chart/`, bump `chart/Chart.yaml` `version` in the same PR.
- Bump `appVersion` when the deployed app behavior meaningfully changes.

## Verification
- Run `python -m unittest discover -s tests` for app changes.
- Run `helm template cluster-news ./chart` for chart changes.

