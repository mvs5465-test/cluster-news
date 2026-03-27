import type { NewsStats, StoryRecord } from "@/lib/news";

type FilterBarProps = {
  categories: string[];
  feeds: string[];
  selectedCategory: string;
  selectedFeed: string;
};

type StoryProps = {
  story: StoryRecord;
};

export function FilterBar({
  categories,
  feeds,
  selectedCategory,
  selectedFeed,
}: FilterBarProps) {
  return (
    <section className="filter-bar">
      <div className="filter-bar__row">
        <div>
          <p className="section-label">Edition controls</p>
          <h2>Shape the front page</h2>
        </div>
        <form action="/api/refresh?redirect=/" method="post">
          <button className="action-button action-button--primary" type="submit">
            Refresh feeds
          </button>
        </form>
      </div>
      <form action="/" className="filter-controls">
        <label className="filter-control">
          <span className="filter-label">Category</span>
          <select className="filter-select" name="category" defaultValue={selectedCategory}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-control">
          <span className="filter-label">Feed</span>
          <select className="filter-select" name="feed" defaultValue={selectedFeed}>
            <option value="">All feeds</option>
            {feeds.map((feed) => (
              <option key={feed} value={feed}>
                {feed}
              </option>
            ))}
          </select>
        </label>
        <button className="action-button" type="submit">
          Apply filters
        </button>
      </form>
    </section>
  );
}

export function HeroStory({ story, stats }: { story: StoryRecord | null; stats: NewsStats }) {
  if (!story) {
    return (
      <article className="hero-story">
        <div className="hero-story__fallback" />
        <div className="hero-story__content">
          <p className="section-label">Front page</p>
          <h1 className="hero-story__headline">Refresh your feeds to build today&apos;s edition.</h1>
          <p className="hero-story__summary">
            Cluster News now has the frame for a real editorial homepage. It just needs
            stories.
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="hero-story">
      {story.imageUrl ? (
        <div className="hero-story__media">
          <img src={story.imageUrl} alt={story.title} />
        </div>
      ) : (
        <div className="hero-story__fallback" />
      )}
      <div className="hero-story__content">
        <div className="story-meta">
          <span>{story.category}</span>
          <span className="story-feed">{story.feedName}</span>
          <span className="story-feed">{story.prettyDate}</span>
        </div>
        <h1 className="hero-story__headline">{story.title}</h1>
        {story.summary ? <p className="hero-story__summary">{story.summary}</p> : null}
        <div className="hero-story__footer">
          <SaveStoryButton story={story} redirect="/" />
          <a className="story-open story-open--primary" href={story.url} target="_blank" rel="noreferrer">
            Open source
          </a>
          <div className="hero-story__stats">
            <div className="hero-stat">
              <span>Stories</span>
              <strong>{stats.totalStories}</strong>
            </div>
            <div className="hero-stat">
              <span>Saved</span>
              <strong>{stats.savedStories}</strong>
            </div>
            <div className="hero-stat">
              <span>Feeds</span>
              <strong>{stats.feedCount}</strong>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function SideRailStory({ story }: StoryProps) {
  return (
    <article className="side-rail-card">
      <div className="story-meta">
        <span>{story.category}</span>
        <span className="story-feed">{story.prettyDate}</span>
      </div>
      <h2>{story.title}</h2>
      {story.summary ? <p>{story.summary}</p> : null}
      <div className="story-list-item__footer">
        <SaveStoryButton story={story} redirect="/" />
        <a className="story-open" href={story.url} target="_blank" rel="noreferrer">
          Read
        </a>
      </div>
    </article>
  );
}

export function StoryCard({ story, redirect = "/" }: StoryProps & { redirect?: string }) {
  return (
    <article className="story-card">
      {story.imageUrl ? (
        <div className="story-card__media">
          <img src={story.imageUrl} alt={story.title} />
        </div>
      ) : (
        <div className="story-card__fallback" />
      )}
      <div className="story-card__content">
        <div className="story-meta">
          <span>{story.category}</span>
          <span className="story-feed">{story.feedName}</span>
        </div>
        <h3 className="story-card__headline">{story.title}</h3>
        {story.summary ? <p className="story-card__summary">{story.summary}</p> : null}
        <div className="story-card__footer">
          <SaveStoryButton story={story} redirect={redirect} />
          <a className="story-open story-open--primary" href={story.url} target="_blank" rel="noreferrer">
            Open story
          </a>
        </div>
      </div>
    </article>
  );
}

export function StoryListItem({
  story,
  compact = false,
  redirect = "/",
}: StoryProps & { compact?: boolean; redirect?: string }) {
  return (
    <article className={`story-list-item${compact ? " story-list-item--compact" : ""}`}>
      <div className="story-meta">
        <span>{story.category}</span>
        <span className="story-feed">{story.feedName}</span>
        <span className="story-feed">{story.prettyDate}</span>
      </div>
      <h3 className="story-list-item__headline">{story.title}</h3>
      {story.summary ? <p>{story.summary}</p> : null}
      <div className="story-list-item__footer">
        <SaveStoryButton story={story} redirect={redirect} />
        <a className="story-open" href={story.url} target="_blank" rel="noreferrer">
          Open story
        </a>
      </div>
    </article>
  );
}

export function NewsSection({
  title,
  stories,
  redirect = "/",
}: {
  title: string;
  stories: StoryRecord[];
  redirect?: string;
}) {
  if (!stories.length) {
    return null;
  }

  return (
    <section className="section-block">
      <div className="section-heading">
        <div>
          <p className="section-label">Section</p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="news-section-grid">
        {stories.map((story) => (
          <StoryListItem key={story.id} story={story} redirect={redirect} />
        ))}
      </div>
    </section>
  );
}

export function BriefingPanel({
  briefing,
  ollamaEnabled,
}: {
  briefing: string | null;
  ollamaEnabled: boolean;
}) {
  const paragraphs = briefing
    ? briefing
        .split("\n")
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : [];

  return (
    <section className="briefing-panel">
      <div>
        <p className="section-label">Daily readout</p>
        <h1>Morning briefing</h1>
      </div>
      <p>
        Turn the feed stack into a compact editorial summary. The page stays useful
        without AI, but the briefing becomes the quick first read when Ollama is
        configured.
      </p>
      <div className="briefing-panel__actions">
        <form action="/api/refresh?redirect=/briefing" method="post">
          <button className="action-button" type="submit">
            Refresh stories
          </button>
        </form>
      </div>
      {ollamaEnabled ? (
        paragraphs.length ? (
          <div className="briefing-copy">
            {paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        ) : (
          <p>No briefing yet. Once stories are available, this page generates one automatically.</p>
        )
      ) : (
        <p>OLLAMA_BASE_URL is not configured. The feed experience still works normally.</p>
      )}
    </section>
  );
}

function SaveStoryButton({
  story,
  redirect,
}: {
  story: StoryRecord;
  redirect: string;
}) {
  return (
    <form action={`/api/stories/${story.id}/save?redirect=${encodeURIComponent(redirect)}`} method="post">
      <button className="story-save" type="submit">
        {story.isSaved ? "Saved" : "Save"}
      </button>
    </form>
  );
}
