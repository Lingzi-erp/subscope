import * as cheerio from 'cheerio'
import { item, sortDesc, fetchWithCffi } from '../../lib.ts'
import type { Source, FeedItem } from '../../types.ts'

const BASE = 'https://www.fcc.gov'

// FCC headlines page behind Akamai. cffi with Safari TLS impersonation bypasses it.
export const fetchFCC = async (source: Source): Promise<FeedItem[]> => {
  const $ = cheerio.load(await fetchWithCffi(source.url))
  const items: FeedItem[] = []
  const seen = new Set<string>()

  $('a[href*="/document/"]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href || href.includes('/document/search')) return

    const url = href.startsWith('http') ? href : `${BASE}${href}`
    if (seen.has(url)) return
    seen.add(url)

    let title = $(el).text().trim()
    title = title.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
    if (!title || title.length < 10 || title.length > 300) return
    // Skip generic titles: "News Release", "Carr Statement", etc.
    if (/^(News Release|Memorandum Opinion and Order|\w+ Statement)$/i.test(title)) return

    items.push(item(source, url, title))
  })

  return sortDesc(items)
}
