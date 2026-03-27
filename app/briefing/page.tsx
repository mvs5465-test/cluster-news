import { BriefingPanel, StoryListItem } from "@/components/news";
import { getBriefingPageData } from "@/lib/news";

export const dynamic = "force-dynamic";

export default async function BriefingPage() {
  const data = await getBriefingPageData();

  return (
    <main className="page">
      <section className="briefing-layout">
        <BriefingPanel briefing={data.briefing} ollamaEnabled={data.ollamaEnabled} />
        <section className="section-block section-block--tight">
          <div className="section-heading">
            <div>
              <p className="section-label">Source stack</p>
              <h2>Stories feeding the briefing</h2>
            </div>
          </div>
          <div className="newswire-list">
            {data.stories.map((story) => (
              <StoryListItem key={story.id} story={story} redirect="/briefing" />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
