import crypto from "node:crypto";
import fs from "node:fs";
import Parser from "rss-parser";
import { OLLAMA_BASE_URL, OLLAMA_MODEL, REFRESH_MINUTES, SITE_NAME } from "@/lib/config";
import { getDb } from "@/lib/db";

type FeedConfig = {
  name: string;
  url: string;
  category: string;
};

type FeedEntry = Record<string, unknown> & {
  title?: string;
  link?: string;
  summary?: string;
  content?: string;
  contentSnippet?: string;
  isoDate?: string;
  pubDate?: string;
  enclosure?: { url?: string };
};

export type StoryRecord = {
  id: number;
  feedName: string;
  category: string;
  title: string;
  url: string;
  summary: string;
  imageUrl: string | null;
  imageHint: string | null;
  prettyDate: string;
  publishedAt: string | null;
  fetchedAt: string;
  isSaved: boolean;
};

export type NewsStats = {
  totalStories: number;
  savedStories: number;
  feedCount: number;
  latestStoryAt: string | null;
};

type HomePageData = {
  leadStory: StoryRecord | null;
  sideStories: StoryRecord[];
  featuredStories: StoryRecord[];
  newswireStories: StoryRecord[];
  sections: Array<{ title: string; stories: StoryRecord[] }>;
  categories: string[];
  feeds: string[];
  selectedCategory: string;
  selectedFeed: string;
  stats: NewsStats;
};

const parser = new Parser({
  timeout: 15000,
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["content:encoded", "contentEncoded"],
      ["description", "description"],
    ],
  },
});

let refreshPromise: Promise<void> | null = null;

export async function getHomePageData(
  rawSearchParams: Record<string, string | string[] | undefined>,
): Promise<HomePageData> {
  await maybeRefresh();

  const category = singleParam(rawSearchParams.category);
  const feed = singleParam(rawSearchParams.feed);
  const stories = listStories({ category, feedName: feed, limit: 60 });
  const leadStory = stories[0] ?? null;
  const sideStories = stories.slice(1, 4);
  const featuredStories = stories.slice(4, 10);
  const newswireStories = stories.slice(10, 22);
  const sections = buildSections(stories);

  return {
    leadStory,
    sideStories,
    featuredStories,
    newswireStories,
    sections,
    categories: listCategories(),
    feeds: listFeedNames(),
    selectedCategory: category,
    selectedFeed: feed,
    stats: collectStats(),
  };
}

export async function getBriefingPageData() {
  await maybeRefresh();
  const stories = listStories({ limit: 12 });
  const briefing = OLLAMA_BASE_URL ? await generateBriefing(stories) : null;
  return {
    stories,
    briefing,
    ollamaEnabled: Boolean(OLLAMA_BASE_URL),
    siteName: SITE_NAME,
  };
}

export async function getSavedPageData() {
  await maybeRefresh();
  return {
    stories: listStories({ savedOnly: true, limit: 60 }),
  };
}

export function toggleSavedStory(storyId: number) {
  const db = getDb();
  db.prepare(
    `
      UPDATE stories
      SET is_saved = CASE WHEN is_saved = 1 THEN 0 ELSE 1 END
      WHERE id = ?
    `,
  ).run(storyId);
}

export async function refreshFeeds(force: boolean) {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const feeds = loadFeeds();
    const now = new Date().toISOString();

    for (const feed of feeds) {
      try {
        const parsed = await parser.parseURL(feed.url);
        upsertFeed(feed, null, null);
        for (const entry of parsed.items ?? []) {
          upsertStory(feed, entry as unknown as FeedEntry, now);
        }
        upsertFeed(feed, now, null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        upsertFeed(feed, null, message);
        if (force) {
          console.warn(`feed refresh failed for ${feed.name}: ${message}`);
        }
      }
    }
  })();

  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function maybeRefresh() {
  const db = getDb();
  const row = db
    .prepare("SELECT MAX(last_success_at) AS last_success_at FROM feeds")
    .get() as { last_success_at?: string | null } | undefined;

  const lastSuccessAt = row?.last_success_at || null;
  if (!lastSuccessAt) {
    await refreshFeeds(true);
    return;
  }

  const lastSuccessAtMs = Date.parse(lastSuccessAt);
  if (!Number.isFinite(lastSuccessAtMs)) {
    await refreshFeeds(true);
    return;
  }

  const ageMs = Date.now() - lastSuccessAtMs;
  if (ageMs >= REFRESH_MINUTES * 60 * 1000) {
    await refreshFeeds(false);
  }
}

function loadFeeds(): FeedConfig[] {
  const path = process.env.NEWS_FEEDS_PATH?.trim();
  if (path) {
    try {
      const raw = JSON.parse(fs.readFileSync(path, "utf8"));
      return normalizeFeeds(raw);
    } catch {
      return defaultFeeds();
    }
  }

  const inline = process.env.NEWS_FEEDS_JSON?.trim();
  if (inline) {
    try {
      return normalizeFeeds(JSON.parse(inline));
    } catch {
      return defaultFeeds();
    }
  }

  return defaultFeeds();
}

function normalizeFeeds(rawFeeds: unknown): FeedConfig[] {
  if (!Array.isArray(rawFeeds)) {
    return defaultFeeds();
  }

  const feeds = rawFeeds
    .map((item) => {
      const candidate = item as Partial<FeedConfig>;
      return {
        name: String(candidate.name || "").trim(),
        url: String(candidate.url || "").trim(),
        category: String(candidate.category || "General").trim() || "General",
      };
    })
    .filter((feed) => feed.name && feed.url);

  return feeds.length ? feeds : defaultFeeds();
}

function defaultFeeds(): FeedConfig[] {
  return [
    { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "World" },
    { name: "Reuters World", url: "https://feeds.reuters.com/Reuters/worldNews", category: "World" },
    { name: "The Verge", url: "https://www.theverge.com/rss/index.xml", category: "Tech" },
    { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", category: "Tech" },
    { name: "Hacker News", url: "https://hnrss.org/frontpage", category: "Ideas" },
  ];
}

function upsertFeed(feed: FeedConfig, lastSuccessAt: string | null, lastError: string | null) {
  const db = getDb();
  db.prepare(
    `
      INSERT INTO feeds (name, url, category, last_success_at, last_error)
      VALUES (@name, @url, @category, @lastSuccessAt, @lastError)
      ON CONFLICT(url) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        last_success_at = COALESCE(excluded.last_success_at, feeds.last_success_at),
        last_error = excluded.last_error
    `,
  ).run({
    name: feed.name,
    url: feed.url,
    category: feed.category,
    lastSuccessAt,
    lastError,
  });
}

function upsertStory(feed: FeedConfig, entry: FeedEntry, fetchedAt: string) {
  const link = String(entry.link || "").trim();
  const title = String(entry.title || "").trim();
  if (!link || !title) {
    return;
  }

  const summary = cleanSummary(
    String(entry.contentSnippet || entry.summary || entry.description || entry.contentEncoded || entry.content || "").trim(),
  );
  const image = pickImage(entry);
  const storyHash = stableHash(`${link}|${title}`);
  const publishedAt = entryTimestamp(entry);

  const db = getDb();
  db.prepare(
    `
      INSERT INTO stories (
        story_hash,
        feed_name,
        feed_url,
        category,
        title,
        url,
        summary,
        published_at,
        fetched_at,
        image_url,
        image_hint
      ) VALUES (
        @storyHash,
        @feedName,
        @feedUrl,
        @category,
        @title,
        @url,
        @summary,
        @publishedAt,
        @fetchedAt,
        @imageUrl,
        @imageHint
      )
      ON CONFLICT(story_hash) DO UPDATE SET
        summary = excluded.summary,
        published_at = COALESCE(excluded.published_at, stories.published_at),
        fetched_at = excluded.fetched_at,
        category = excluded.category,
        image_url = COALESCE(excluded.image_url, stories.image_url),
        image_hint = COALESCE(excluded.image_hint, stories.image_hint)
    `,
  ).run({
    storyHash,
    feedName: feed.name,
    feedUrl: feed.url,
    category: feed.category,
    title,
    url: link,
    summary,
    publishedAt,
    fetchedAt,
    imageUrl: image.url,
    imageHint: image.hint,
  });
}

function listStories({
  category = "",
  feedName = "",
  savedOnly = false,
  limit = 60,
}: {
  category?: string;
  feedName?: string;
  savedOnly?: boolean;
  limit?: number;
}): StoryRecord[] {
  const db = getDb();
  const clauses: string[] = [];
  const parameters: unknown[] = [];

  if (category) {
    clauses.push("category = ?");
    parameters.push(category);
  }
  if (feedName) {
    clauses.push("feed_name = ?");
    parameters.push(feedName);
  }
  if (savedOnly) {
    clauses.push("is_saved = 1");
  }

  parameters.push(limit);
  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `
        SELECT *
        FROM stories
        ${whereClause}
        ORDER BY COALESCE(published_at, fetched_at) DESC, id DESC
        LIMIT ?
      `,
    )
    .all(...parameters) as Array<Record<string, unknown>>;

  return rows.map(mapStoryRow);
}

function listCategories(): string[] {
  const db = getDb();
  const rows = db.prepare("SELECT DISTINCT category FROM stories ORDER BY category ASC").all() as Array<{
    category: string;
  }>;
  return rows.map((row) => row.category);
}

function listFeedNames(): string[] {
  const db = getDb();
  const rows = db.prepare("SELECT DISTINCT feed_name FROM stories ORDER BY feed_name ASC").all() as Array<{
    feed_name: string;
  }>;
  return rows.map((row) => row.feed_name);
}

function collectStats(): NewsStats {
  const db = getDb();
  const totals = db
    .prepare(
      `
        SELECT
          COUNT(*) AS total_stories,
          SUM(CASE WHEN is_saved = 1 THEN 1 ELSE 0 END) AS saved_stories,
          COUNT(DISTINCT feed_name) AS feed_count
        FROM stories
      `,
    )
    .get() as {
    total_stories: number | null;
    saved_stories: number | null;
    feed_count: number | null;
  };
  const latest = db
    .prepare("SELECT MAX(COALESCE(published_at, fetched_at)) AS latest_story_at FROM stories")
    .get() as { latest_story_at: string | null };

  return {
    totalStories: totals.total_stories || 0,
    savedStories: totals.saved_stories || 0,
    feedCount: totals.feed_count || 0,
    latestStoryAt: latest.latest_story_at || null,
  };
}

async function generateBriefing(stories: StoryRecord[]) {
  if (!stories.length) {
    return null;
  }

  const bullets = stories.slice(0, 12).map((story) => {
    const snippet = story.summary.slice(0, 220);
    return `- [${story.category}] ${story.title} :: ${snippet}`;
  });

  const response = await fetch(`${OLLAMA_BASE_URL.replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: [
        "You are writing a concise personal news briefing.",
        "Group headlines into 3-5 themes.",
        "Use short paragraphs and finish with one 'worth watching' line.",
        "Do not mention that you are an AI.",
        "",
        "Headlines:",
        ...bullets,
      ].join("\n"),
      stream: false,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { response?: string };
  return payload.response?.trim() || null;
}

function mapStoryRow(row: Record<string, unknown>): StoryRecord {
  const publishedAt = typeof row.published_at === "string" ? row.published_at : null;
  const fetchedAt = String(row.fetched_at || "");
  return {
    id: Number(row.id),
    feedName: String(row.feed_name || ""),
    category: String(row.category || ""),
    title: String(row.title || ""),
    url: String(row.url || ""),
    summary: cleanSummary(String(row.summary || "")),
    imageUrl: typeof row.image_url === "string" && row.image_url ? row.image_url : null,
    imageHint: typeof row.image_hint === "string" && row.image_hint ? row.image_hint : null,
    prettyDate: formatPrettyDate(publishedAt || fetchedAt),
    publishedAt,
    fetchedAt,
    isSaved: Number(row.is_saved || 0) === 1,
  };
}

function buildSections(stories: StoryRecord[]) {
  const groups = new Map<string, StoryRecord[]>();

  for (const story of stories.slice(0, 30)) {
    const list = groups.get(story.category) || [];
    list.push(story);
    groups.set(story.category, list);
  }

  return [...groups.entries()]
    .filter(([, items]) => items.length >= 2)
    .slice(0, 3)
    .map(([title, items]) => ({
      title,
      stories: items.slice(0, 3),
    }));
}

function entryTimestamp(entry: FeedEntry) {
  if (entry.isoDate) {
    const parsed = new Date(entry.isoDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  if (entry.pubDate) {
    const parsed = new Date(entry.pubDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
}

function pickImage(entry: FeedEntry) {
  const candidates = [
    readMediaUrl(entry.enclosure),
    ...readMediaArray(entry.mediaContent),
    ...readMediaArray(entry.mediaThumbnail),
    extractImageFromHtml(String(entry.contentEncoded || entry.content || entry.summary || entry.description || "")),
  ].filter(Boolean) as string[];

  const unique = candidates.find((candidate) => /^https?:\/\//.test(candidate));
  return {
    url: unique || null,
    hint: unique ? imageHintFromUrl(unique) : null,
  };
}

function readMediaUrl(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as { url?: unknown };
  return typeof candidate.url === "string" ? candidate.url : null;
}

function readMediaArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => readMediaUrl(item))
    .filter((candidate): candidate is string => Boolean(candidate));
}

function extractImageFromHtml(html: string) {
  const srcMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return srcMatch?.[1] || null;
}

function cleanSummary(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPrettyDate(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function imageHintFromUrl(url: string) {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function stableHash(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function singleParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}
