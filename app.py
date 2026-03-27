import hashlib
import json
import os
import sqlite3
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import feedparser
from flask import Flask, Response, g, redirect, render_template, request, url_for, current_app
from opentelemetry import context, trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import SpanKind, Status, StatusCode
from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, Counter, Histogram, generate_latest, multiprocess


TRACER_NAME = "cluster-news"
_TRACING_CONFIGURED = False
_REFRESH_LOCK = threading.Lock()

HTTP_REQUESTS = Counter(
    "cluster_news_http_requests_total",
    "Total HTTP requests handled by cluster-news.",
    ["method", "handler", "status"],
)
HTTP_REQUEST_DURATION = Histogram(
    "cluster_news_http_request_duration_seconds",
    "HTTP request latency for cluster-news.",
    ["method", "handler"],
)
REFRESH_RUNS = Counter(
    "cluster_news_refresh_runs_total",
    "Total feed refresh attempts.",
    ["status"],
)


def default_feeds() -> list[dict[str, str]]:
    return [
        {
            "name": "BBC World",
            "url": "https://feeds.bbci.co.uk/news/world/rss.xml",
            "category": "World",
        },
        {
            "name": "Reuters World",
            "url": "https://feeds.reuters.com/Reuters/worldNews",
            "category": "World",
        },
        {
            "name": "The Verge",
            "url": "https://www.theverge.com/rss/index.xml",
            "category": "Tech",
        },
        {
            "name": "Ars Technica",
            "url": "https://feeds.arstechnica.com/arstechnica/index",
            "category": "Tech",
        },
        {
            "name": "Hacker News",
            "url": "https://hnrss.org/frontpage",
            "category": "Ideas",
        },
    ]


def _env_flag(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _otlp_endpoint() -> str:
    return (
        os.environ.get("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
        or os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
        or ""
    ).strip()


def _otlp_insecure(endpoint: str) -> bool:
    if not endpoint:
        return False
    if "OTEL_EXPORTER_OTLP_TRACES_INSECURE" in os.environ:
        return _env_flag("OTEL_EXPORTER_OTLP_TRACES_INSECURE", False)
    if "OTEL_EXPORTER_OTLP_INSECURE" in os.environ:
        return _env_flag("OTEL_EXPORTER_OTLP_INSECURE", False)
    return endpoint.startswith("http://")


def configure_tracing() -> bool:
    global _TRACING_CONFIGURED

    endpoint = _otlp_endpoint()
    if not endpoint:
        return False
    if _TRACING_CONFIGURED:
        return True

    provider = TracerProvider(
        resource=Resource.create(
            {"service.name": os.environ.get("OTEL_SERVICE_NAME", TRACER_NAME)}
        )
    )
    exporter = OTLPSpanExporter(
        endpoint=endpoint,
        insecure=_otlp_insecure(endpoint),
    )
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    _TRACING_CONFIGURED = True
    return True


def _start_request_span() -> None:
    tracer = trace.get_tracer(TRACER_NAME)
    span = tracer.start_span(
        f"{request.method} {request.path}",
        kind=SpanKind.SERVER,
    )
    span.set_attribute("http.request.method", request.method)
    span.set_attribute("url.path", request.path)
    if request.host:
        span.set_attribute("server.address", request.host)

    token = context.attach(trace.set_span_in_context(span))
    g._otel_request_span = span
    g._otel_request_token = token


def _finish_request_span(*, status_code: int | None = None, error_obj: BaseException | None = None) -> None:
    span = g.pop("_otel_request_span", None)
    token = g.pop("_otel_request_token", None)
    if span is None:
        return

    if status_code is not None:
        span.set_attribute("http.response.status_code", status_code)
        if status_code >= 500:
            span.set_status(Status(StatusCode.ERROR))

    if error_obj is not None:
        span.record_exception(error_obj)
        span.set_status(Status(StatusCode.ERROR))

    span.end()
    if token is not None:
        context.detach(token)


def _handler_label() -> str:
    if request.url_rule is not None:
        return request.url_rule.rule
    return request.path


def _metrics_response() -> Response:
    multiproc_dir = os.environ.get("PROMETHEUS_MULTIPROC_DIR", "").strip()
    if multiproc_dir:
        registry = CollectorRegistry()
        multiprocess.MultiProcessCollector(registry)
        payload = generate_latest(registry)
    else:
        payload = generate_latest()
    return Response(payload, mimetype=CONTENT_TYPE_LATEST)


def _db_path_from_env() -> str:
    data_dir = Path(os.environ.get("NEWS_DATA_DIR", "data"))
    return os.environ.get("NEWS_DB_PATH", str(data_dir / "news.db"))


def load_feeds() -> list[dict[str, str]]:
    path = os.environ.get("NEWS_FEEDS_PATH", "").strip()
    if path:
        file_path = Path(path)
        if file_path.exists():
            return _normalize_feeds(json.loads(file_path.read_text()))

    inline = os.environ.get("NEWS_FEEDS_JSON", "").strip()
    if inline:
        return _normalize_feeds(json.loads(inline))
    return default_feeds()


def _normalize_feeds(raw_feeds) -> list[dict[str, str]]:
    feeds = []
    for item in raw_feeds or []:
        name = str(item.get("name", "")).strip()
        url = str(item.get("url", "")).strip()
        category = str(item.get("category", "General")).strip() or "General"
        if not name or not url:
            continue
        feeds.append({"name": name, "url": url, "category": category})
    return feeds or default_feeds()


def feed_value(parsed, key: str, default=None):
    if hasattr(parsed, key):
        return getattr(parsed, key)
    if isinstance(parsed, dict):
        return parsed.get(key, default)
    return default


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.update(
        NEWS_DB_PATH=_db_path_from_env(),
        NEWS_SITE_NAME=os.environ.get("NEWS_SITE_NAME", "Cluster News"),
        NEWS_REFRESH_MINUTES=max(int(os.environ.get("NEWS_REFRESH_MINUTES", "30")), 1),
        OLLAMA_BASE_URL=os.environ.get("OLLAMA_BASE_URL", "").strip(),
        OLLAMA_MODEL=os.environ.get("OLLAMA_MODEL", "llama3.2:3b").strip(),
        NEWS_FEEDS=load_feeds(),
    )
    if test_config:
        app.config.update(test_config)

    db_path = Path(app.config["NEWS_DB_PATH"])
    db_path.parent.mkdir(parents=True, exist_ok=True)

    configure_tracing()

    @app.template_filter("pretty_ts")
    def pretty_ts(value: str | None) -> str:
        if not value:
            return "No date"
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            return value
        return parsed.astimezone().strftime("%b %-d, %-I:%M %p")

    @app.before_request
    def before_request():
        g.request_started_at = time.perf_counter()
        _start_request_span()

    @app.after_request
    def after_request(response):
        elapsed = time.perf_counter() - g.get("request_started_at", time.perf_counter())
        handler = _handler_label()
        status = str(response.status_code)
        HTTP_REQUESTS.labels(request.method, handler, status).inc()
        HTTP_REQUEST_DURATION.labels(request.method, handler).observe(elapsed)
        _finish_request_span(status_code=response.status_code)
        return response

    @app.teardown_request
    def teardown_request(exc):
        if exc is not None:
            _finish_request_span(error_obj=exc)
        close_db()

    @app.route("/metrics")
    def metrics():
        return _metrics_response()

    @app.route("/", methods=["GET"])
    def home():
        maybe_refresh()
        category = request.args.get("category", "").strip()
        feed_name = request.args.get("feed", "").strip()
        saved_only = request.args.get("saved") == "1"
        stories = list_stories(category=category, feed_name=feed_name, saved_only=saved_only)
        return render_template(
            "home.html",
            site_name=current_app.config["NEWS_SITE_NAME"],
            stories=stories,
            categories=list_categories(),
            feeds=list_feed_names(),
            selected_category=category,
            selected_feed=feed_name,
            saved_only=saved_only,
            stats=collect_stats(),
            ollama_enabled=bool(current_app.config["OLLAMA_BASE_URL"]),
        )

    @app.route("/refresh", methods=["POST"])
    def refresh():
        refresh_feeds(force=True)
        return redirect(request.referrer or url_for("home"))

    @app.route("/stories/<int:story_id>/save", methods=["POST"])
    def toggle_save(story_id: int):
        db = get_db()
        db.execute(
            "UPDATE stories SET is_saved = CASE WHEN is_saved = 1 THEN 0 ELSE 1 END WHERE id = ?",
            (story_id,),
        )
        db.commit()
        return redirect(request.referrer or url_for("home"))

    @app.route("/briefing", methods=["GET", "POST"])
    def briefing():
        maybe_refresh()
        stories = list_stories(limit=12)
        briefing_text = None
        error = None
        if request.method == "POST":
            try:
                briefing_text = generate_briefing(stories)
            except RuntimeError as exc:
                error = str(exc)
        return render_template(
            "briefing.html",
            site_name=current_app.config["NEWS_SITE_NAME"],
            stories=stories,
            briefing_text=briefing_text,
            error=error,
            ollama_enabled=bool(current_app.config["OLLAMA_BASE_URL"]),
        )

    with app.app_context():
        init_db()

    return app


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        connection = sqlite3.connect(current_app.config["NEWS_DB_PATH"])
        connection.row_factory = sqlite3.Row
        g.db = connection
    return g.db


def close_db() -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    db = get_db()
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS feeds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL,
            last_success_at TEXT,
            last_error TEXT
        )
        """
    )
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS stories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            story_hash TEXT NOT NULL UNIQUE,
            feed_name TEXT NOT NULL,
            feed_url TEXT NOT NULL,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            summary TEXT,
            published_at TEXT,
            fetched_at TEXT NOT NULL,
            is_saved INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    db.commit()


def maybe_refresh() -> None:
    db = get_db()
    row = db.execute(
        "SELECT MAX(last_success_at) AS last_success_at FROM feeds"
    ).fetchone()
    last_success_at = row["last_success_at"] if row else None
    if not last_success_at:
        refresh_feeds(force=True)
        return
    parsed = datetime.fromisoformat(last_success_at)
    age = datetime.now(timezone.utc) - parsed
    if age.total_seconds() >= current_app.config["NEWS_REFRESH_MINUTES"] * 60:
        refresh_feeds(force=False)


def upsert_feed(feed: dict[str, str], *, last_success_at: str | None = None, last_error: str | None = None) -> None:
    db = get_db()
    db.execute(
        """
        INSERT INTO feeds (name, url, category, last_success_at, last_error)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(url) DO UPDATE SET
            name = excluded.name,
            category = excluded.category,
            last_success_at = COALESCE(excluded.last_success_at, feeds.last_success_at),
            last_error = excluded.last_error
        """,
        (feed["name"], feed["url"], feed["category"], last_success_at, last_error),
    )
    db.commit()


def refresh_feeds(force: bool) -> None:
    if not _REFRESH_LOCK.acquire(blocking=False):
        return

    try:
        tracer = trace.get_tracer(TRACER_NAME)
        with tracer.start_as_current_span("feeds.refresh", kind=SpanKind.INTERNAL):
            feeds = current_app.config["NEWS_FEEDS"]
            now = datetime.now(timezone.utc).isoformat()
            for feed in feeds:
                try:
                    parsed = feedparser.parse(feed["url"])
                    entries = feed_value(parsed, "entries", []) or []
                    if feed_value(parsed, "bozo", 0) and not entries:
                        raise RuntimeError(str(feed_value(parsed, "bozo_exception", "feed parsing failed")))
                    upsert_feed(feed)
                    for entry in entries:
                        upsert_story(feed, entry, fetched_at=now)
                    upsert_feed(feed, last_success_at=now, last_error=None)
                    REFRESH_RUNS.labels("success").inc()
                except Exception as exc:
                    upsert_feed(feed, last_error=str(exc))
                    REFRESH_RUNS.labels("error").inc()
                    if force:
                        current_app.logger.warning("feed refresh failed for %s: %s", feed["name"], exc)
    finally:
        _REFRESH_LOCK.release()


def upsert_story(feed: dict[str, str], entry, *, fetched_at: str) -> None:
    link = str(feed_value(entry, "link", "") or "").strip()
    title = str(feed_value(entry, "title", "") or "").strip()
    summary = str(
        feed_value(entry, "summary", "")
        or feed_value(entry, "description", "")
        ).strip()
    if not title or not link:
        return

    published_at = entry_timestamp(entry)
    story_hash = hashlib.sha256(f"{link}|{title}".encode("utf-8")).hexdigest()
    db = get_db()
    db.execute(
        """
        INSERT INTO stories (
            story_hash, feed_name, feed_url, category, title, url, summary, published_at, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(story_hash) DO UPDATE SET
            summary = excluded.summary,
            published_at = COALESCE(excluded.published_at, stories.published_at),
            fetched_at = excluded.fetched_at,
            category = excluded.category
        """,
        (
            story_hash,
            feed["name"],
            feed["url"],
            feed["category"],
            title,
            link,
            summary,
            published_at,
            fetched_at,
        ),
    )
    db.commit()


def entry_timestamp(entry) -> str | None:
    parsed = (
        feed_value(entry, "published_parsed")
        or feed_value(entry, "updated_parsed")
    )
    if not parsed:
        return None
    return datetime.fromtimestamp(time.mktime(parsed), tz=timezone.utc).isoformat()


def list_stories(*, category: str = "", feed_name: str = "", saved_only: bool = False, limit: int = 60):
    db = get_db()
    clauses = []
    parameters: list = []
    if category:
        clauses.append("category = ?")
        parameters.append(category)
    if feed_name:
        clauses.append("feed_name = ?")
        parameters.append(feed_name)
    if saved_only:
        clauses.append("is_saved = 1")

    where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    parameters.append(limit)
    query = f"""
        SELECT *
        FROM stories
        {where_clause}
        ORDER BY COALESCE(published_at, fetched_at) DESC, id DESC
        LIMIT ?
    """
    return db.execute(query, parameters).fetchall()


def list_categories():
    db = get_db()
    rows = db.execute("SELECT DISTINCT category FROM stories ORDER BY category ASC").fetchall()
    return [row["category"] for row in rows]


def list_feed_names():
    db = get_db()
    rows = db.execute("SELECT DISTINCT feed_name FROM stories ORDER BY feed_name ASC").fetchall()
    return [row["feed_name"] for row in rows]


def collect_stats() -> dict[str, int | str | None]:
    db = get_db()
    totals = db.execute(
        """
        SELECT
            COUNT(*) AS total_stories,
            SUM(CASE WHEN is_saved = 1 THEN 1 ELSE 0 END) AS saved_stories,
            COUNT(DISTINCT feed_name) AS feed_count
        FROM stories
        """
    ).fetchone()
    latest = db.execute(
        "SELECT MAX(COALESCE(published_at, fetched_at)) AS latest_story_at FROM stories"
    ).fetchone()
    return {
        "total_stories": totals["total_stories"] or 0,
        "saved_stories": totals["saved_stories"] or 0,
        "feed_count": totals["feed_count"] or 0,
        "latest_story_at": latest["latest_story_at"] if latest else None,
    }


def generate_briefing(stories) -> str:
    if not current_app.config["OLLAMA_BASE_URL"]:
        raise RuntimeError("OLLAMA_BASE_URL is not configured for this app.")
    if not stories:
        raise RuntimeError("No stories are available yet. Refresh feeds first.")

    bullets = []
    for story in stories[:12]:
        summary = (story["summary"] or "").replace("\n", " ").strip()
        snippet = summary[:220]
        bullets.append(f"- [{story['category']}] {story['title']} :: {snippet}")

    prompt = "\n".join(
        [
            "You are writing a concise personal news briefing.",
            "Group headlines into 3-5 themes.",
            "Use short paragraphs and finish with one 'worth watching' line.",
            "Do not mention that you are an AI.",
            "",
            "Headlines:",
            *bullets,
        ]
    )

    payload = json.dumps(
        {
            "model": current_app.config["OLLAMA_MODEL"],
            "prompt": prompt,
            "stream": False,
        }
    ).encode("utf-8")
    url = current_app.config["OLLAMA_BASE_URL"].rstrip("/") + "/api/generate"
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Failed to reach Ollama at {url}: {exc}") from exc
    return str(body.get("response", "")).strip() or "No briefing returned."


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
