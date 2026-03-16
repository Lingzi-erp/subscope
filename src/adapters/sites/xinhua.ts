import * as cheerio from 'cheerio'
import { item, sortDesc, UA, TLS } from '../../lib.ts'
import { fetchWithBrowser } from '../../browser.ts'
import type { Source, FeedItem } from '../../types.ts'

const BASE = 'http://www.news.cn'

export const fetchXinhua = async (source: Source): Promise<FeedItem[]> => {
  // Try multiple URL variants — news.cn access is flaky
  let html = ''
  const path = new URL(source.url).pathname
  const variants = [
    `http://www.news.cn${path}`,
    `https://www.news.cn${path}`,
    `http://news.cn${path}`,
    `https://news.cn${path}`,
  ]

  for (const url of variants) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, ...TLS(url) } as any)
      if (!res.ok) continue
      const text = await res.text()
      if (text.length > 2000 && /news\.cn\//.test(text)) { html = text; break }
    } catch {}
  }

  if (!html) {
    // Last resort: Playwright with networkidle
    for (const url of variants) {
      try { html = fetchWithBrowser(url, 'networkidle'); break } catch {}
    }
  }

  if (!html) return []

  const $ = cheerio.load(html!)
  const items: FeedItem[] = []
  const seen = new Set<string>()

  $('a[href*="news.cn/"]').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href')
    if (!href) return

    const title = $a.attr('title') || $a.text().trim()
    if (!title || title.length < 4 || title.length > 200) return
    if (href.endsWith('/index.htm') || href.endsWith('/index.html')) return

    const url = href.startsWith('http') ? href : `${BASE}${href}`
    if (!/\/\d{8}\/|\/2\d{3}\//.test(url)) return
    if (seen.has(url)) return
    seen.add(url)

    const dateMatch = url.match(/\/(\d{4})(\d{2})(\d{2})\//)
      || url.match(/\/(\d{4})\/(\d{2})(\d{2})\//)
    const publishedAt = dateMatch
      ? new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T00:00:00+08:00`).toISOString()
      : undefined

    items.push(item(source, url, title, { publishedAt }))
  })

  return sortDesc(items)
}
