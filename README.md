# Cluster News

A lightweight self-hosted news front page for the local cluster.

## Features

- Curated RSS and Atom feed ingestion
- SQLite persistence in a single local file
- Saved stories
- Thumbnail-aware editorial homepage with lead story and section rails
- Optional AI briefing generation through Ollama
- One-container deployment with a built-in Helm chart

## Local Run

```bash
npm install
npm run dev
```

The app listens on `http://127.0.0.1:8080` by default and stores data in `./data/news.db`.

To force a feed refresh locally, use the Refresh button in the UI or:

```bash
curl -X POST http://127.0.0.1:8080/api/refresh
```

## Configuration

Feed sources can be configured with:

- `NEWS_FEEDS_JSON`: inline JSON array of feeds
- `NEWS_FEEDS_PATH`: path to a JSON file containing feeds

Each feed item should look like:

```json
{
  "name": "BBC World",
  "url": "https://feeds.bbci.co.uk/news/world/rss.xml",
  "category": "World"
}
```

Optional AI briefing support:

- `OLLAMA_BASE_URL=http://ollama-external.ai.svc.cluster.local:11434`
- `OLLAMA_MODEL=llama3.2:3b`

The app automatically attempts to extract a representative image from feed metadata or embedded item HTML so the homepage can render a more magazine-like layout.

## Kubernetes

The Helm chart lives in `chart/`. To persist data with a standard Kubernetes PVC, set:

```yaml
persistence:
  enabled: true
  size: 1Gi
  mountPath: /data
```
