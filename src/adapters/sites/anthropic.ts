import * as cheerio from 'cheerio'
import { createHash } from 'crypto'
import type { Source, FeedItem } from '../../types.ts'

const hash = (...parts: string[]) =>
  createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 12)

const BASE = 'https://www.anthropic.com'

export const fetchAnthropic = async (source: Source): Promise<FeedItem[]> => {
  const html = await fetch(source.url).then(r => r.text())

  if (source.url.includes('/engineering')) {
    return parseEngineering(html, source)
  }
  return parseRSC(html, source)
}

// ── /blog, /research: data lives in RSC JSON payload ──

const parseRSC = (html: string, source: Source): FeedItem[] => {
  const items: FeedItem[] = []
  const seen = new Set<string>()
  const pathPrefix = source.url.includes('/research') ? '/research/' : '/news/'

  let pos = 0
  while ((pos = html.indexOf('publishedOn', pos + 1)) !== -1) {
    const window = html.slice(pos, pos + 1500)

    const date = window.match(/publishedOn.{3,6}?(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/)?.[1]
    const slug = window.match(/slug.*?current.{3,6}?([\w-]+)/)?.[1]
    const title = window.match(/title\\*":\\*"(.+?)\\*"/)?.[1]
    // summary can be null or a quoted string — only capture the string case
    const summaryMatch = window.match(/summary\\*":(null|\\*"(.+?)\\*")/)
    const summary = summaryMatch?.[1] === 'null' ? undefined : summaryMatch?.[2]

    if (!date || !slug || !title) continue
    if (seen.has(slug)) continue
    seen.add(slug)

    const url = `${BASE}${pathPrefix}${slug}`
    items.push({
      id: hash(source.id, url),
      sourceId: source.id,
      sourceType: 'website',
      sourceName: source.name,
      title: clean(title),
      url,
      summary: summary ? clean(summary) : undefined,
      publishedAt: new Date(date).toISOString(),
    })
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

// ── /engineering: rendered HTML with <article> elements ──

const parseEngineering = (html: string, source: Source): FeedItem[] => {
  const $ = cheerio.load(html)
  const items: FeedItem[] = []
  const seen = new Set<string>()

  // Collect all articles first, preserving page order
  const articles: { href: string; title: string; dateText: string; summary: string }[] = []
  $('article a[href^="/engineering/"]').each((_, el) => {
    const $el = $(el)
    const href = $el.attr('href')!
    const title = $el.find('h3').first().text().trim()
    const dateText = $el.find('[class*="date"]').text().trim()
    const summary = $el.find('p').first().text().trim()

    if (!title || seen.has(href)) return
    seen.add(href)
    articles.push({ href, title, dateText, summary })
  })

  // For articles without dates, infer position relative to dated ones.
  // Find the earliest dated article, then assign undated ones timestamps
  // just above it (preserving their original page order).
  const firstDated = articles.find(a => a.dateText)
  const fallbackBase = firstDated
    ? new Date(firstDated.dateText).getTime()
    : Date.now()

  let undatedOffset = 0

  for (const a of articles) {
    const url = `${BASE}${a.href}`
    let publishedAt: string

    if (a.dateText) {
      publishedAt = new Date(a.dateText).toISOString()
    } else {
      // Place undated articles just after the earliest dated one,
      // each 1 second apart to preserve page order
      undatedOffset++
      publishedAt = new Date(fallbackBase + undatedOffset * 1000).toISOString()
    }

    items.push({
      id: hash(source.id, url),
      sourceId: source.id,
      sourceType: 'website',
      sourceName: source.name,
      title: a.title,
      url,
      summary: a.summary || undefined,
      publishedAt,
    })
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

const clean = (s: string) =>
  s.replace(/\\+"/g, '').replace(/\\+n/g, ' ').replace(/\s+/g, ' ').trim()
