import * as cheerio from 'cheerio'
import { item, sortDesc, UA, TLS } from '../../lib.ts'
import type { Source, FeedItem } from '../../types.ts'

const BASE = 'https://www.cftc.gov'

export const fetchCFTC = async (source: Source): Promise<FeedItem[]> => {
  const res = await fetch(source.url, { headers: { 'User-Agent': UA }, ...TLS(source.url) } as any)
  if (!res.ok) throw new Error(`CFTC: ${res.status}`)
  const $ = cheerio.load(await res.text())
  const items: FeedItem[] = []
  const seen = new Set<string>()

  $('table tbody tr').each((_, el) => {
    const $a = $(el).find('td.views-field-field-pdf-link a')
    const title = $a.text().trim()
    const href = $a.attr('href')
    if (!title || !href) return

    const url = href.startsWith('http') ? href : `${BASE}${href}`
    if (seen.has(url)) return
    seen.add(url)

    const datetime = $(el).find('td.views-field-field-date time[datetime]').attr('datetime')
    items.push(item(source, url, title, {
      publishedAt: datetime ? new Date(datetime).toISOString() : undefined,
    }))
  })

  return sortDesc(items)
}
