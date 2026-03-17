import { item, sortDesc, fetchWithCffi } from '../../lib.ts'
import type { Source, FeedItem } from '../../types.ts'

// World Bank: Bun TLS can't connect, use cffi for JSON API
export const fetchWorldBank = async (source: Source): Promise<FeedItem[]> => {
  const text = await fetchWithCffi(source.url)
  const data = JSON.parse(text) as { documents?: Record<string, WBDoc> }
  if (!data.documents) return []

  const items: FeedItem[] = []
  for (const [id, doc] of Object.entries(data.documents)) {
    const title = unwrap(doc.title)
    const url = doc.url
    if (!title || !url) continue

    const summary = unwrap(doc.descr)?.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().slice(0, 200) || undefined
    const publishedAt = doc.lnchdt ? new Date(doc.lnchdt).toISOString() : undefined
    const conttype = doc.displayconttype || doc.conttype || undefined

    items.push(item(source, url, conttype ? `[${conttype}] ${title}` : title, {
      key: id,
      summary,
      publishedAt,
    }))
  }

  return sortDesc(items)
}

interface WBDoc {
  title?: string | { 'cdata!'?: string }
  url?: string
  lnkurl?: string
  descr?: string | { 'cdata!'?: string }
  displayconttype?: string
  conttype?: string
  display_date?: string
  lnchdt?: string
}

const unwrap = (v?: string | { 'cdata!'?: string }): string | undefined => {
  if (!v) return undefined
  if (typeof v === 'string') return v
  return v['cdata!']
}
