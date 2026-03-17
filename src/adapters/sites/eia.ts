import * as cheerio from 'cheerio'
import { item, sortDesc, fetchWithCffi } from '../../lib.ts'
import type { Source, FeedItem } from '../../types.ts'

const BASE = 'https://www.eia.gov/todayinenergy/'

export const fetchEIA = async (source: Source): Promise<FeedItem[]> => {
  const $ = cheerio.load(await fetchWithCffi(source.url))
  const items: FeedItem[] = []

  $('.tie-article').each((_, el) => {
    const $a = $(el).find('h1 a, h2 a')
    const title = $a.text().trim()
    const href = $a.attr('href')
    if (!title || !href) return

    const url = href.startsWith('http') ? href : `${BASE}${href}`
    const dateText = $(el).find('.date').text().trim()

    items.push(item(source, url, title, {
      publishedAt: dateText ? new Date(dateText).toISOString() : undefined,
    }))
  })

  return sortDesc(items)
}
