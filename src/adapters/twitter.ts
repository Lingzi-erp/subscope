import { createHash } from 'crypto'
import type { Source, FeedItem, SourceAdapter } from '../types.ts'

const hash = (...parts: string[]) =>
  createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 12)

const SYNDICATION_URL = 'https://syndication.twitter.com/srv/timeline-profile/screen-name/'

export const twitter: SourceAdapter = {
  type: 'twitter',
  test: (url: string) => {
    const { hostname } = new URL(url)
    return hostname.includes('twitter.com') || hostname.includes('x.com')
  },

  async fetch(source: Source): Promise<FeedItem[]> {
    const username = extractUsername(source.url)
    if (!username) return []

    const res = await fetch(`${SYNDICATION_URL}${username}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    if (!res.ok) return []

    const html = await res.text()
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
    if (!match) return []

    const data = JSON.parse(match[1]!)
    const entries: any[] = data?.props?.pageProps?.timeline?.entries ?? []

    const items: FeedItem[] = []
    for (const entry of entries) {
      const tweet = entry?.content?.tweet
      if (!tweet?.text || !tweet?.id_str) continue
      // Skip retweets
      if (tweet.retweeted_status_result) continue

      const tweetUrl = `https://x.com/${username}/status/${tweet.id_str}`

      items.push({
        id: hash(source.id, tweet.id_str),
        sourceId: source.id,
        sourceType: 'twitter',
        sourceName: source.name,
        title: cleanTweetText(tweet.text),
        url: tweetUrl,
        publishedAt: new Date(tweet.created_at).toISOString(),
      })
    }

    return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  },
}

const extractUsername = (url: string): string | null => {
  const { pathname } = new URL(url)
  const match = pathname.match(/^\/?@?([\w]+)/)
  return match?.[1] ?? null
}

// Clean up t.co links and trim
const cleanTweetText = (text: string): string =>
  text.replace(/https:\/\/t\.co\/\w+/g, '').replace(/\s+/g, ' ').trim()
