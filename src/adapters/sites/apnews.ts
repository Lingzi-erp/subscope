import * as cheerio from 'cheerio'
import { item, sortDesc, UA } from '../../lib.ts'
import type { Source, FeedItem } from '../../types.ts'

const BASE = 'https://apnews.com'

export const fetchAPNews = async (source: Source): Promise<FeedItem[]> => {
  const res = await fetch(source.url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`AP News: ${res.status}`)
  const $ = cheerio.load(await res.text())

  const items: FeedItem[] = []
  const seen = new Set<string>()

  $('a[href*="/article/"]').each((_, el) => {
    const href = $(el).attr('href')!
    const url = href.startsWith('http') ? href : `${BASE}${href}`
    if (seen.has(url)) return
    seen.add(url)

    // Title: look for heading inside the link, or use link text
    const title = $(el).find('h2, h3, [class*="CardHeadline"]').text().trim()
      || $(el).text().trim()
    if (!title || title.length < 10) return

    items.push(item(source, url, title))
  })

  // Enrich with timestamps from article meta (fetch first few)
  const enriched = await Promise.allSettled(
    items.slice(0, 30).map(async (fi) => {
      try {
        const res = await fetch(fi.url, { headers: { 'User-Agent': UA } })
        if (!res.ok) return fi
        const html = await res.text()
        const $a = cheerio.load(html)
        const pub = $a('meta[property="article:published_time"]').attr('content')
        if (pub) fi.publishedAt = new Date(pub).toISOString()
        const desc = $a('meta[property="og:description"]').attr('content')
        if (desc) fi.summary = desc.slice(0, 200)
      } catch {}
      return fi
    })
  )

  return sortDesc(
    enriched
      .filter((r): r is PromiseFulfilledResult<FeedItem> => r.status === 'fulfilled')
      .map(r => r.value)
  )
}
