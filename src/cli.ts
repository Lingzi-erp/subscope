#!/usr/bin/env bun

import { load, save, addSource, removeSource } from './config.ts'
import { createStore } from './store.ts'
import { fetchAll, read } from './pipeline.ts'
import { detectType } from './adapters/index.ts'
import { renderFeed, renderInteractive, renderSources } from './render.ts'
import { createHash } from 'crypto'
import type { Source } from './types.ts'

const [command, ...args] = process.argv.slice(2)

const commands: Record<string, () => Promise<void>> = {
  add: async () => {
    const url = args[0]
    if (!url) {
      console.error('Usage: subscope add <url>')
      process.exit(1)
    }

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      console.error(`Invalid URL: ${url}`)
      process.exit(1)
    }

    const config = load()
    if (config.sources.some(s => s.url === parsed.href)) {
      console.log('Source already exists.')
      return
    }

    const type = detectType(parsed.href)
    const id = createHash('sha256').update(parsed.href).digest('hex').slice(0, 8)
    const host = parsed.hostname.replace('www.', '')
    const path = parsed.pathname.replace(/\/+$/, '')
    const name = path && path !== '/' ? `${host}${path}` : host

    const source: Source = {
      id,
      url: parsed.href,
      type,
      name,
      addedAt: new Date().toISOString(),
    }

    save(addSource(config, source))
    console.log(`\n  Added: ${name} (${type})\n`)
  },

  ls: async () => {
    const { sources } = load()
    renderSources(sources)
  },

  rm: async () => {
    const target = args[0]
    if (!target) {
      console.error('Usage: subscope rm <id|url>')
      process.exit(1)
    }

    const config = load()
    const source = config.sources.find(s => s.id === target || s.url === target)
    if (!source) {
      console.error('Source not found.')
      process.exit(1)
    }

    save(removeSource(config, source.id))
    const store = createStore()
    store.removeBySource(source.id)
    store.close()
    console.log(`\n  Removed: ${source.name}\n`)
  },

  fetch: async () => {
    const config = load()
    if (config.sources.length === 0) {
      console.log('\n  No sources to fetch. Add one with: subscope add <url>\n')
      return
    }

    console.log('\n  Fetching...\n')
    const total = await fetchAll()
    console.log(`\n  Done. ${total} items fetched.\n`)
  },
}

// --- route ---

const parseReadFlags = (argv: string[]) => {
  const opts: { limit?: number; sourceType?: string; all?: boolean } = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-n' && argv[i + 1]) opts.limit = parseInt(argv[i + 1]!)
    if (argv[i] === '--type' && argv[i + 1]) opts.sourceType = argv[i + 1]
    if (argv[i] === '--all' || argv[i] === '-a') opts.all = true
  }
  return opts
}

if (!command || command.startsWith('-')) {
  const opts = parseReadFlags(process.argv.slice(2))
  const { items, olderCount } = read(opts)

  const isTTY = process.stdout.isTTY
  const explicitLimit = opts.limit !== undefined

  if (isTTY && !explicitLimit) {
    // Interactive pager: show all items, paginate with arrow keys
    await renderInteractive(items)
  } else {
    renderFeed(items, olderCount)
  }
} else if (commands[command]) {
  await commands[command]!()
} else {
  console.error(`Unknown command: ${command}`)
  console.error('Commands: add, ls, rm, fetch')
  process.exit(1)
}
