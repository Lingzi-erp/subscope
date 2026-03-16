import { item, sortDesc } from '../../lib.ts'
import type { Source, FeedItem } from '../../types.ts'

const BASE = 'http://www.csrc.gov.cn'
const CHANNEL_ID = 'a1a078ee0bc54721ab6b148884c784a8' // 证监会要闻

interface CSRCResult {
  title: string
  url: string
  publishedTimeStr: string
  memo?: string
}

export const fetchCSRC = async (source: Source): Promise<FeedItem[]> => {
  const api = `${BASE}/searchList/${CHANNEL_ID}?_isAgg=true&_isJson=true&_pageSize=18&page=1`
  const res = await fetch(api, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  })
  if (!res.ok) throw new Error(`CSRC: ${res.status}`)

  const json = (await res.json()) as { data: { results: CSRCResult[] } }
  const items: FeedItem[] = []

  for (const r of json.data.results) {
    if (!r.title || !r.url) continue
    const url = r.url.startsWith('http') ? r.url
      : r.url.startsWith('//') ? `http:${r.url}`
      : `${BASE}${r.url}`

    items.push(item(source, url, r.title, {
      summary: r.memo?.slice(0, 200),
      publishedAt: r.publishedTimeStr
        ? new Date(r.publishedTimeStr + '+08:00').toISOString()
        : undefined,
    }))
  }

  return sortDesc(items)
}
