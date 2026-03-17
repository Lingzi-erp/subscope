import * as cheerio from 'cheerio'
import { item, sortDesc, fetchWithCffi, DIR } from '../../lib.ts'
import type { Source, FeedItem } from '../../types.ts'
import { join } from 'path'
import { readFileSync } from 'fs'
import { parse as yamlParse } from 'yaml'

const BASE = 'https://www.reuters.com'

const getDatadomeCookie = (): string | undefined => {
  try {
    const auth = yamlParse(readFileSync(join(DIR, 'auth.yml'), 'utf-8'))
    return auth?.reuters?.datadome
  } catch { return undefined }
}

// Chrome-like headers to match the browser fingerprint that generated the datadome cookie
const CHROME_HEADERS: Record<string, string> = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Sec-CH-UA': '"Chromium";"v="133", "Not(A:Brand";"v="99", "Google Chrome";"v="133"',
  'Sec-CH-UA-Mobile': '?0',
  'Sec-CH-UA-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
}

// Reuters uses Datadome anti-bot (JS challenge). Bypass with browser datadome cookie.
// Set via: subscope auth reuters <cookie>
export const fetchReuters = async (source: Source): Promise<FeedItem[]> => {
  const dd = getDatadomeCookie()
  const cookies = dd ? { datadome: dd } : undefined
  const $ = cheerio.load(await fetchWithCffi(source.url, 'chrome133a', CHROME_HEADERS, cookies))
  const items: FeedItem[] = []
  const seen = new Set<string>()

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href || !/^\/world\/.*-\d{4}-\d{2}-\d{2}\/$/.test(href)) return

    const url = `${BASE}${href}`
    if (seen.has(url)) return
    seen.add(url)

    let title = $(el).find('h3, h2, [data-testid="Heading"]').first().text().trim()
      || $(el).text().trim()
    title = title.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
    if (!title || title.length < 10 || title.length > 300) return

    const dateMatch = href.match(/(\d{4})-(\d{2})-(\d{2})\/$/)
    const publishedAt = dateMatch
      ? new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T12:00:00Z`).toISOString()
      : undefined

    items.push(item(source, url, title, { publishedAt }))
  })

  return sortDesc(items)
}
