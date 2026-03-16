import * as cheerio from 'cheerio'
import { item, sortDesc, UA, TLS } from '../../lib.ts'
import type { Source, FeedItem } from '../../types.ts'

const BASE = 'https://www.boj.or.jp'

export const fetchBOJ = async (source: Source): Promise<FeedItem[]> => {
  const $ = cheerio.load(
    await fetch(source.url, { headers: { 'User-Agent': UA }, ...TLS(source.url) } as any).then(r => r.text())
  )
  const items: FeedItem[] = []

  $('table.js-tbl tbody tr').each((_, el) => {
    const tds = $(el).find('td')
    if (tds.length < 2) return

    const dateText = tds.first().text().replace(/\s+/g, ' ').trim()
    const $a = tds.last().find('a')
    const title = $a.text().trim()
    const href = $a.attr('href')
    if (!title || !href) return

    const url = href.startsWith('http') ? href : `${BASE}${href}`
    const publishedAt = parseDate(dateText)

    items.push(item(source, url, title, { publishedAt }))
  })

  return sortDesc(items)
}

const parseDate = (text: string): string | undefined => {
  // "Mar.  3, 2026" or "Feb. 28, 2026"
  const m = text.match(/([A-Z][a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/)
  if (!m) return undefined
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  }
  const mm = months[m[1]!]
  if (!mm) return undefined
  const dd = m[2]!.padStart(2, '0')
  return new Date(`${m[3]}-${mm}-${dd}T12:00:00+09:00`).toISOString()
}
