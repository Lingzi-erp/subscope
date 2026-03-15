import * as cheerio from 'cheerio'
import { createHash } from 'crypto'
import type { Source, FeedItem, SourceAdapter } from '../types.ts'

const hash = (...parts: string[]) =>
  createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 12)

export const youtube: SourceAdapter = {
  type: 'youtube',
  test: (url: string) => {
    const { hostname } = new URL(url)
    return hostname.includes('youtube.com') || hostname.includes('youtu.be')
  },

  async fetch(source: Source): Promise<FeedItem[]> {
    // Resolve channel ID if we have a handle URL (@username)
    const channelId = await resolveChannelId(source.url)
    if (!channelId) return []

    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    const xml = await fetch(feedUrl).then(r => r.text())
    const $ = cheerio.load(xml, { xml: true })

    const items: FeedItem[] = []

    $('entry').each((_, el) => {
      const title = $(el).find('title').text().trim()
      const videoId = $(el).find('yt\\:videoId, videoId').text().trim()
      const published = $(el).find('published').text().trim()
      const description = $(el).find('media\\:description, description').text().trim()

      if (!title || !videoId) return

      const url = `https://www.youtube.com/watch?v=${videoId}`

      items.push({
        id: hash(source.id, videoId),
        sourceId: source.id,
        sourceType: 'youtube',
        sourceName: source.name,
        title,
        url,
        summary: description ? description.slice(0, 200) : undefined,
        publishedAt: published ? new Date(published).toISOString() : new Date().toISOString(),
      })
    })

    return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  },
}

// Resolve @handle or channel URL to channel ID
const resolveChannelId = async (url: string): Promise<string | null> => {
  // Already a channel ID in the URL
  const directMatch = url.match(/channel\/(UC[\w-]+)/)
  if (directMatch) return directMatch[1]!

  // Fetch the page and extract channel ID
  try {
    const html = await fetch(url).then(r => r.text())
    return html.match(/"channelId":"(UC[^"]+)"/)?.[1]
      ?? html.match(/"externalId":"(UC[^"]+)"/)?.[1]
      ?? null
  } catch {
    return null
  }
}
