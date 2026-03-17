import * as cheerio from 'cheerio'
import { item, sortDesc, fetchWithCffi } from '../../lib.ts'
import type { Source, FeedItem } from '../../types.ts'

const BASE = 'https://www.reuters.com'

// Reuters uses Datadome anti-bot. cffi with Safari TLS impersonation bypasses it.
export const fetchReuters = async (source: Source): Promise<FeedItem[]> => {
  const $ = cheerio.load(await fetchWithCffi(source.url))
  const items: FeedItem[] = []
  const seen = new Set<string>()

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href || !/^\/world\/.*-\d{4}-\d{2}-\d{2}\/$/.test(href)) return

    const url = `${BASE}${href}`
    if (seen.has(url)) return
    seen.add(url)

    let title = $(el).find('h3, h2, [data-testid="Heading"]').first().text().trim()
      || $(el).text().trim()
    title = title.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
    if (!title || title.length < 10 || title.length > 300) return

    // Extract date from URL: /world/.../title-YYYY-MM-DD/
    const dateMatch = href.match(/(\d{4})-(\d{2})-(\d{2})\/$/)
    const publishedAt = dateMatch
      ? new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T12:00:00Z`).toISOString()
      : undefined

    items.push(item(source, url, title, { publishedAt }))
  })

  return sortDesc(items)
}
