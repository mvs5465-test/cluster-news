import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import app as cluster_news
from feedparser import FeedParserDict


class ClusterNewsAppTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "news.db"
        self.app = cluster_news.create_app(
            {
                "TESTING": True,
                "NEWS_DB_PATH": str(self.db_path),
                "NEWS_FEEDS": [
                    {
                        "name": "Test Feed",
                        "url": "https://example.com/feed.xml",
                        "category": "Tech",
                    }
                ],
                "OLLAMA_BASE_URL": "",
            }
        )
        self.client = self.app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_home_page_renders(self):
        with patch.object(cluster_news.feedparser, "parse", return_value=FeedParserDict({"bozo": 0, "entries": []})):
            response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Cluster News", response.data)

    def test_refresh_ingests_story(self):
        fake_feed = FeedParserDict(
            {
                "bozo": 0,
                "entries": [
                    FeedParserDict(
                        {
                            "title": "Test headline",
                            "link": "https://example.com/story",
                            "summary": "A concise summary.",
                        }
                    )
                ],
            }
        )
        with patch.object(cluster_news.feedparser, "parse", return_value=fake_feed):
            response = self.client.post("/refresh", follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Test headline", response.data)


if __name__ == "__main__":
    unittest.main()
