import { load } from './config.ts'
import { createStore } from './store.ts'
import { resolve } from './adapters/index.ts'
import type { FeedItem, SourceType } from './types.ts'

export interface ReadOpts {
  limit?: number
  sourceType?: SourceType
  since?: string
  all?: boolean
}

export const fetchAll = async (): Promise<number> => {
  const config = load()
  const store = createStore()
  let total = 0

  for (const source of config.sources) {
    const adapter = resolve(source.url)
    try {
      const items = await adapter.fetch(source)
      store.save(items)
      total += items.length
      console.log(`  ${source.name} — ${items.length} items`)
    } catch (err) {
      console.error(`  ${source.name} — failed: ${err}`)
    }
  }

  store.close()
  return total
}

const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000

export const read = (opts: ReadOpts = {}): { items: FeedItem[]; olderCount: number } => {
  const store = createStore()

  const since = opts.all
    ? undefined
    : (opts.since ?? new Date(Date.now() - TWO_WEEKS).toISOString())

  const items = store.query({ limit: opts.limit, sourceType: opts.sourceType, since })
  const olderCount = since ? store.count({ sourceType: opts.sourceType, since }) : 0

  store.close()
  return { items, olderCount }
}
