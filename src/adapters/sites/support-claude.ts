import * as cheerio from 'cheerio'
import { createHash } from 'crypto'
import type { Source, FeedItem } from '../../types.ts'

const hash = (...parts: string[]) =>
  createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 12)

// ── Collection page: scrape article links ──

export const fetchSupportCollection = async (source: Source): Promise<FeedItem[]> => {
  const html = await fetch(source.url).then(r => r.text())
  const $ = cheerio.load(html)
  const articleUrls: { url: string; title: string }[] = []
  const seen = new Set<string>()

  // Skip static/tutorial articles — only track promotions and dynamic content
  const SKIP = new Set([
    'release-notes',
    'how-to-get-support',
    'usage-limit-best-practices',
    'how-do-usage-and-length-limits-work',
  ])

  $('a[href*="/articles/"]').each((_, el) => {
    const href = $(el).attr('href')
    const title = $(el).text().trim().replace(/\s+/g, ' ')

    if (!href || !title || title.length < 5) return
    const slug = href.split('/').pop() ?? ''
    if (SKIP.has(slug.replace(/^\d+-/, ''))) return
    const fullUrl = href.startsWith('http') ? href : `https://support.claude.com${href}`
    if (seen.has(fullUrl)) return
    seen.add(fullUrl)
    articleUrls.push({ url: fullUrl, title })
  })

  // Fetch each article page to get real dates (collection is small, this is fast)
  const items = await Promise.all(
    articleUrls.map(async ({ url, title }) => {
      const date = await fetchArticleDate(url)
      return {
        id: hash(source.id, url),
        sourceId: source.id,
        sourceType: 'website' as const,
        sourceName: source.name,
        title,
        url,
        publishedAt: date,
      }
    })
  )

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

// Intercom article pages contain lastUpdatedISO in embedded JSON
const fetchArticleDate = async (url: string): Promise<string> => {
  try {
    const html = await fetch(url).then(r => r.text())
    const match = html.match(/lastUpdatedISO.{3,5}?(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/)
    if (match) return match[1]!
  } catch {}
  return new Date().toISOString()
}

// ── Release notes page: <h3>Date</h3> followed by <p><b>Title</b></p> ──

export const fetchReleaseNotes = async (source: Source): Promise<FeedItem[]> => {
  const html = await fetch(source.url).then(r => r.text())
  const $ = cheerio.load(html)
  const items: FeedItem[] = []
  const seen = new Set<string>()

  $('h3').each((_, el) => {
    const dateText = $(el).text().trim()
    if (!/^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(dateText)) return

    // Walk subsequent siblings to find bold titles
    let next = $(el).parent().next()
    while (next.length) {
      const bold = next.find('b, strong').first().text().trim()
      if (!bold) break

      // Stop if we hit the next date heading
      if (next.find('h3').length) break

      const key = `${dateText}-${bold}`
      if (!seen.has(key)) {
        seen.add(key)
        items.push({
          id: hash(source.id, key),
          sourceId: source.id,
          sourceType: 'website',
          sourceName: source.name,
          title: bold,
          url: source.url,
          publishedAt: new Date(dateText).toISOString(),
        })
      }

      next = next.next()
    }
  })

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

