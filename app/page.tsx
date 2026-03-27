import {
  FilterBar,
  HeroStory,
  NewsSection,
  SideRailStory,
  StoryCard,
  StoryListItem,
} from "@/components/news";
import { getHomePageData } from "@/lib/news";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const data = await getHomePageData(resolvedSearchParams);

  return (
    <main className="page">
      <section className="front-page-grid">
        <HeroStory story={data.leadStory} stats={data.stats} />
        <aside className="side-rail">
          {data.sideStories.map((story) => (
            <SideRailStory key={story.id} story={story} />
          ))}
        </aside>
      </section>

      <FilterBar
        categories={data.categories}
        feeds={data.feeds}
        selectedCategory={data.selectedCategory}
        selectedFeed={data.selectedFeed}
      />

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="section-label">Top stories</p>
            <h2>Latest from your front page</h2>
          </div>
          <p className="section-description">
            Ordered by freshness across every configured feed, with larger cards
            where the images carry the story.
          </p>
        </div>
        <div className="story-card-grid">
          {data.featuredStories.map((story) => (
            <StoryCard key={story.id} story={story} redirect="/" />
          ))}
        </div>
      </section>

      {data.sections.map((section) => (
        <NewsSection key={section.title} title={section.title} stories={section.stories} redirect="/" />
      ))}

      <section className="section-block section-block--tight">
        <div className="section-heading">
          <div>
            <p className="section-label">Newswire</p>
            <h2>More headlines</h2>
          </div>
        </div>
        <div className="newswire-list">
          {data.newswireStories.map((story) => (
            <StoryListItem key={story.id} story={story} compact />
          ))}
        </div>
      </section>
    </main>
  );
}
