import * as cheerio from 'cheerio'
import { item, sortDesc, UA } from '../../lib.ts'
import type { Source, FeedItem } from '../../types.ts'

const BASE = 'https://www.anthropic.com'
// Anthropic uses Sanity CMS — GROQ API returns clean JSON, ~1KB vs 350KB RSC HTML
const SANITY = 'https://4zrzovbb.api.sanity.io/v2024-01-01/data/query/website'
const QUERY = '*[_type == "post"] | order(publishedOn desc) [0...50] { title, slug, publishedOn, summary, "dir": directories[0].value }'

export const fetchAnthropic = async (source: Source): Promise<FeedItem[]> => {
  if (source.url.includes('/engineering')) return fetchEngineering(source)

  const dir = source.url.includes('/research') ? 'research' : 'news'
  const pathPrefix = dir === 'research' ? '/research/' : '/news/'

  const res = await fetch(`${SANITY}?query=${encodeURIComponent(QUERY)}`, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Sanity API: ${res.status}`)
  const json = (await res.json()) as any

  return sortDesc((json.result || [])
    .filter((r: any) => r.dir === dir && r.title && r.slug?.current)
    .map((r: any) => item(source, `${BASE}${pathPrefix}${r.slug.current}`, r.title, {
      summary: r.summary || undefined,
      publishedAt: r.publishedOn ? new Date(r.publishedOn).toISOString() : undefined,
    })))
}

// /engineering: rendered HTML with <article> elements — no Sanity directory for this
const fetchEngineering = async (source: Source): Promise<FeedItem[]> => {
  const html = await fetch(source.url, { headers: { 'User-Agent': UA } }).then(r => r.text())
  const $ = cheerio.load(html)
  const seen = new Set<string>()

  const articles: { href: string; title: string; dateText: string; summary: string }[] = []
  $('article a[href^="/engineering/"]').each((_, el) => {
    const $el = $(el)
    const href = $el.attr('href')!
    const title = $el.find('h3').first().text().trim()
    if (!title || seen.has(href)) return
    seen.add(href)
    articles.push({
      href, title,
      dateText: $el.find('[class*="date"]').text().trim(),
      summary: $el.find('p').first().text().trim(),
    })
  })

  const firstDated = articles.find(a => a.dateText)
  const fallbackBase = firstDated ? new Date(firstDated.dateText).getTime() : Date.now()
  let undatedOffset = 0

  return sortDesc(articles.map(a => {
    const publishedAt = a.dateText
      ? new Date(a.dateText).toISOString()
      : new Date(fallbackBase + ++undatedOffset * 1000).toISOString()
    return item(source, `${BASE}${a.href}`, a.title, {
      summary: a.summary || undefined, publishedAt,
    })
  }))
}
