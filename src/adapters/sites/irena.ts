import * as cheerio from 'cheerio'
import { item, sortDesc, UA } from '../../lib.ts'
import type { Source, FeedItem } from '../../types.ts'

const BASE = 'https://www.irena.org'

export const fetchIRENA = async (source: Source): Promise<FeedItem[]> => {
  const res = await fetch(source.url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`IRENA: ${res.status}`)
  const $ = cheerio.load(await res.text())
  const items: FeedItem[] = []
  const seen = new Set<string>()

  // News listing: links to /News/articles/ or /News/pressreleases/
  $('a[href*="/News/"]').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href')
    if (!href || href === '/News' || href.endsWith('/News/')) return

    const title = $a.text().trim() || $a.attr('title')?.trim()
    if (!title || title.length < 10 || title.length > 300) return
    // Skip navigation links
    if (['News', 'Press Releases', 'Articles', 'Events'].includes(title)) return

    const url = href.startsWith('http') ? href : `${BASE}${href}`
    if (seen.has(url)) return
    seen.add(url)

    // Date from URL: /2026/Mar/ or nearby text
    const dateMatch = url.match(/\/(\d{4})\/(\w{3})\//)
    let publishedAt: string | undefined
    if (dateMatch) {
      publishedAt = new Date(`${dateMatch[2]} 1, ${dateMatch[1]}`).toISOString()
    }

    items.push(item(source, url, title, { publishedAt }))
  })

  return sortDesc(items)
}
