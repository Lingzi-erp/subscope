import * as cheerio from 'cheerio'
import { item, sortDesc, fetchWithCurl } from '../../lib.ts'
import type { Source, FeedItem } from '../../types.ts'

const BASE = 'https://www.opec.org'

export const fetchOPEC = async (source: Source): Promise<FeedItem[]> => {
  const $ = cheerio.load(fetchWithCurl(source.url))
  const items: FeedItem[] = []
  const seen = new Set<string>()

  $('.pritem').each((_, el) => {
    const $block = $(el)
    const title = $block.find('h1, h2, h3').first().text().trim()
    const href = $block.find('a[href*="pr-detail"]').attr('href')
    if (!title || !href) return

    const url = href.startsWith('http') ? href
      : href.startsWith('./') ? `${BASE}/${href.slice(2)}`
      : `${BASE}${href}`
    if (seen.has(url)) return
    seen.add(url)

    const dateMatch = href.match(/(\d{1,2})-(\w+)-(\d{4})\.html/)
    let publishedAt: string | undefined
    if (dateMatch) {
      try { publishedAt = new Date(`${dateMatch[2]} ${dateMatch[1]}, ${dateMatch[3]}`).toISOString() } catch {}
    }

    const summary = $block.find('p.text-justify').first().text().trim().slice(0, 200) || undefined
    items.push(item(source, url, title, { summary, publishedAt }))
  })

  return sortDesc(items)
}
