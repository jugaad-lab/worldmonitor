/**
 * RSS Feed Configuration
 * Subset of feeds for server-side fetching
 */

export const FEEDS = [
  { name: 'Reuters World', url: 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best', tier: 1 },
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', tier: 2 },
  { name: 'Guardian World', url: 'https://www.theguardian.com/world/rss', tier: 2 },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', tier: 2 },
  { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', tier: 2 },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', tier: 3 },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', tier: 3 },
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage', tier: 3 },
];

export const SOURCE_TIERS = {
  'Reuters World': 1,
  'Reuters': 1,
  'AP News': 1,
  'AFP': 1,
  'Bloomberg': 1,
  'BBC World': 2,
  'Guardian World': 2,
  'Al Jazeera': 2,
  'CNBC': 2,
  'CNN': 2,
  'NPR': 2,
  'TechCrunch': 3,
  'The Verge': 3,
  'Hacker News': 3,
};
