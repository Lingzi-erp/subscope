import * as cheerio from 'cheerio'
import { createHash } from 'crypto'
import type { Source, FeedItem } from '../../types.ts'

const hash = (...parts: string[]) =>
  createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 12)

const BASE = 'https://www.claude.com'

export const fetchClaude = async (source: Source): Promise<FeedItem[]> => {
  const html = await fetch(source.url).then(r => r.text())
  const $ = cheerio.load(html)
  const items: FeedItem[] = []
  const seen = new Set<string>()

  $('article').each((_, el) => {
    const $el = $(el)
    const href = $el.find('a[href^="/blog/"]').first().attr('href')
    const title = $el.find('h3').first().text().trim()

    if (!href || !title || seen.has(href)) return
    seen.add(href)

    // Date lives in a div whose own text matches "Month DD, YYYY"
    let dateText = ''
    $el.find('div').each((_, d) => {
      const own = $(d).clone().children().remove().end().text().trim()
      if (/^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(own)) dateText = own
    })

    const url = `${BASE}${href}`
    items.push({
      id: hash(source.id, url),
      sourceId: source.id,
      sourceType: 'website',
      sourceName: source.name,
      title,
      url,
      publishedAt: dateText
        ? new Date(dateText).toISOString()
        : new Date().toISOString(),
    })
  })

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}
