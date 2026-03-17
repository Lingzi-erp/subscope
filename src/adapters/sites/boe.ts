import * as cheerio from 'cheerio'
import { item, sortDesc, fetchWithCffi } from '../../lib.ts'
import type { Source, FeedItem } from '../../types.ts'

// BOE: Bun TLS can't connect (cert error), use cffi for RSS fetch
export const fetchBOE = async (source: Source): Promise<FeedItem[]> => {
  const xml = await fetchWithCffi(source.url)
  const $ = cheerio.load(xml, { xml: true })

  return sortDesc($('item').map((_, el) => {
    const title = $(el).find('title').first().text().trim()
    const link = $(el).find('link').first().text().trim()
    if (!title || !link) return null

    const summary = $(el).find('description').first().text().trim().slice(0, 200) || undefined
    const pubDate = $(el).find('pubDate').first().text().trim()
    const publishedAt = pubDate ? new Date(pubDate).toISOString() : undefined

    return item(source, link, title, { summary, publishedAt })
  }).get().filter(Boolean) as FeedItem[])
}
