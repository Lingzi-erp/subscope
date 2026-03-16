import * as cheerio from 'cheerio'
import { item, sortDesc, fetchWithCffi } from '../../lib.ts'
import type { Source, FeedItem } from '../../types.ts'

const BASE = 'https://www.irena.org'

// IRENA: Azure WAF blocks Chrome TLS but Safari passes via curl_cffi
export const fetchIRENA = async (source: Source): Promise<FeedItem[]> => {
  const $ = cheerio.load(fetchWithCffi(source.url))
  const items: FeedItem[] = []
  const seen = new Set<string>()

  $('a[href*="/News/"]').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href')
    if (!href || href === '/News' || href.endsWith('/News/')) return
    if (!href.includes('/pressreleases/') && !href.includes('/articles/')) return

    const title = $a.text().trim() || $a.attr('title')?.trim()
    if (!title || title.length < 10 || title.length > 300) return
    if (['News', 'Press Releases', 'Articles', 'Events'].includes(title)) return
    // Skip translated versions
    if (/-(?:ZH|RU|FR|ES|AR|PT|JP|IT|DE|KO)$/.test(href)) return

    const url = href.startsWith('http') ? href : `${BASE}${href}`
    if (seen.has(url)) return
    seen.add(url)

    const dateMatch = url.match(/\/(\d{4})\/(\w{3})\//)
    let publishedAt: string | undefined
    if (dateMatch) {
      try { publishedAt = new Date(`${dateMatch[2]} 15, ${dateMatch[1]}`).toISOString() } catch {}
    }

    items.push(item(source, url, title, { publishedAt }))
  })

  return sortDesc(items)
}
