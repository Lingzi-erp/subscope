import * as cheerio from 'cheerio'
import { item, sortDesc, UA, TLS } from '../../lib.ts'
import { fetchWithBrowser } from '../../browser.ts'
import type { Source, FeedItem } from '../../types.ts'

const BASE = 'https://news.cctv.com'

export const fetchCCTV = async (source: Source): Promise<FeedItem[]> => {
  let html: string
  try {
    const res = await fetch(source.url, { headers: { 'User-Agent': UA }, ...TLS(source.url) } as any)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    html = await res.text()
    // JS template check: if no real article links, need Playwright
    if (!/news\.cctv\.com\/20\d{2}\//.test(html)) throw new Error('js shell')
  } catch {
    html = fetchWithBrowser(source.url, 'networkidle')
  }

  const $ = cheerio.load(html)
  const items: FeedItem[] = []
  const seen = new Set<string>()

  $('a[href*="news.cctv.com/20"]').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href')
    if (!href || !href.includes('.shtml')) return

    const title = $a.closest('h3').text().trim()
      || $a.find('h3').text().trim()
      || $a.text().trim()
    if (!title || title.length < 4 || title.length > 200) return

    const url = href.startsWith('http') ? href : `${BASE}${href}`
    if (seen.has(url)) return
    seen.add(url)

    const dateMatch = url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//)
    const publishedAt = dateMatch
      ? new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T00:00:00+08:00`).toISOString()
      : undefined

    const summary = $a.closest('div').find('p').first().text().trim().slice(0, 200) || undefined

    items.push(item(source, url, title, { summary, publishedAt }))
  })

  return sortDesc(items)
}
