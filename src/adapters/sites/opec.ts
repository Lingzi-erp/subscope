import * as cheerio from 'cheerio'
import { item, sortDesc, UA } from '../../lib.ts'
import type { Source, FeedItem } from '../../types.ts'

const BASE = 'https://www.opec.org'

export const fetchOPEC = async (source: Source): Promise<FeedItem[]> => {
  const res = await fetch(source.url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`OPEC: ${res.status}`)
  const $ = cheerio.load(await res.text())
  const items: FeedItem[] = []
  const seen = new Set<string>()

  // Each press release: heading + date text + "READ MORE" link to /pr-detail/
  $('a[href*="/pr-detail/"]').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href')
    if (!href) return

    // Title is in the closest parent block's heading
    const $block = $a.closest('div').parent()
    const title = $block.find('h2, h3, h4').first().text().trim()
      || $a.closest('div').prevAll().find('h2, h3, h4').first().text().trim()
    if (!title || title.length < 10) return

    const url = href.startsWith('http') ? href : `${BASE}${href}`
    if (seen.has(url)) return
    seen.add(url)

    // Date: "4 March 2026 | Vienna, Austria"
    const dateText = $block.text()
    const dateMatch = dateText.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/)
    let publishedAt: string | undefined
    if (dateMatch) {
      publishedAt = new Date(`${dateMatch[2]} ${dateMatch[1]}, ${dateMatch[3]}`).toISOString()
    }

    items.push(item(source, url, title, { publishedAt }))
  })

  return sortDesc(items)
}
