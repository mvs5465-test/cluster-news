import { StoryCard } from "@/components/news";
import { getSavedPageData } from "@/lib/news";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const data = await getSavedPageData();

  return (
    <main className="page">
      <section className="saved-hero">
        <p className="section-label">Reading list</p>
        <h1>Saved stories</h1>
        <p className="section-description">
          A clean queue for pieces worth coming back to, without the rest of the
          feed noise.
        </p>
      </section>

      <section className="story-card-grid">
        {data.stories.length ? (
          data.stories.map((story) => <StoryCard key={story.id} story={story} redirect="/saved" />)
        ) : (
          <article className="empty-panel">
            <h2>No saved stories yet</h2>
            <p>Save stories from the homepage or briefing view to build a reading list.</p>
          </article>
        )}
      </section>
    </main>
  );
}
