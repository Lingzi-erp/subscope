import { createHash } from 'crypto'
import { join } from 'path'
import { homedir } from 'os'
import { readFileSync, existsSync } from 'fs'
import { parse } from 'yaml'
import type { Source, FeedItem, SourceAdapter } from '../types.ts'

const hash = (...parts: string[]) =>
  createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 12)

const SYNDICATION_URL = 'https://syndication.twitter.com/srv/timeline-profile/screen-name/'
const STALE_DAYS = 30 // if newest tweet is older than this, data is stale
const AUTH_FILE = join(homedir(), '.subscope', 'auth.yml')
const SCRAPER_SCRIPT = join(import.meta.dir, 'x-scraper.cjs')

export const twitter: SourceAdapter = {
  type: 'twitter',
  test: (url: string) => {
    const { hostname } = new URL(url)
    return hostname.includes('twitter.com') || hostname.includes('x.com')
  },

  async fetch(source: Source): Promise<FeedItem[]> {
    const username = extractUsername(source.url)
    if (!username) return []

    // Try syndication first (fast, no auth needed)
    const items = await fetchSyndication(username, source)

    // Check if data is stale
    const newest = items[0]?.publishedAt
    const isStale = !newest || (Date.now() - new Date(newest).getTime()) > STALE_DAYS * 86_400_000

    if (!isStale) return items

    // Syndication is stale — try Playwright with auth cookie
    const authToken = loadAuthToken()
    if (!authToken) return items // no auth, return stale data

    const freshItems = await fetchWithPlaywright(username, authToken, source)
    return freshItems.length > 0 ? freshItems : items
  },
}

// ── Syndication (free, no auth) ──

const fetchSyndication = async (username: string, source: Source): Promise<FeedItem[]> => {
  try {
    const res = await fetch(`${SYNDICATION_URL}${username}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    if (!res.ok) {
      if (res.status === 429) throw new Error('rate limited by X syndication API')
      return []
    }

    const html = await res.text()
    if (html.includes('Rate limit exceeded')) throw new Error('rate limited by X syndication API')

    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
    if (!match) return []

    const data = JSON.parse(match[1]!)
    const entries: any[] = data?.props?.pageProps?.timeline?.entries ?? []

    const tweets: RawTweet[] = []
    for (const entry of entries) {
      const t = entry?.content?.tweet
      if (!t?.text || !t?.id_str) continue
      if (t.retweeted_status_result) continue
      tweets.push({
        id: t.id_str,
        text: t.text,
        date: t.created_at,
        replyToId: t.in_reply_to_status_id_str ?? null,
        convId: t.conversation_id_str ?? t.id_str,
      })
    }

    return mergeThreads(tweets, username, source)
  } catch (err) {
    if (err instanceof Error && err.message.includes('rate limit')) throw err
    return []
  }
}

// ── Playwright fallback (needs auth_token cookie, runs via Node) ──

const fetchWithPlaywright = async (username: string, authToken: string, source: Source): Promise<FeedItem[]> => {
  try {
    const proc = Bun.spawn(['node', SCRAPER_SCRIPT, username, authToken], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 30_000,
    })

    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    if (exitCode !== 0) return []

    const tweets: { id: string; text: string; date: string; replyToId?: string | null; convId?: string }[] = JSON.parse(stdout)

    return mergeThreads(tweets, username, source)
  } catch {
    return []
  }
}

// ── Auth ──

const loadAuthToken = (): string | null => {
  try {
    if (!existsSync(AUTH_FILE)) return null
    const raw = parse(readFileSync(AUTH_FILE, 'utf-8')) as any
    return raw?.x?.auth_token ?? null
  } catch {
    return null
  }
}

// ── Shared thread merging ──

type RawTweet = { id: string; text: string; date: string; replyToId?: string | null; convId?: string }

const mergeThreads = (tweets: RawTweet[], username: string, source: Source): FeedItem[] => {
  const byId = new Map<string, RawTweet>()
  for (const t of tweets) byId.set(t.id, t)

  const threadMap = new Map<string, RawTweet[]>()
  const assigned = new Set<string>()

  for (const tweet of byId.values()) {
    if (assigned.has(tweet.id)) continue

    // Walk reply chain up to find root
    let rootId = tweet.id
    let current = tweet
    while (current.replyToId && byId.has(current.replyToId)) {
      rootId = current.replyToId
      current = byId.get(current.replyToId)!
    }
    if (tweet.convId && byId.has(tweet.convId)) rootId = tweet.convId

    const group = threadMap.get(rootId) ?? []
    if (!assigned.has(tweet.id)) {
      group.push(tweet)
      assigned.add(tweet.id)
    }
    threadMap.set(rootId, group)
  }

  // Sweep: orphan replies
  for (const tweet of byId.values()) {
    if (assigned.has(tweet.id)) continue
    if (tweet.replyToId && assigned.has(tweet.replyToId)) {
      for (const [, group] of threadMap) {
        if (group.some(t => t.id === tweet.replyToId)) {
          group.push(tweet)
          assigned.add(tweet.id)
          break
        }
      }
    }
  }

  const items: FeedItem[] = []
  for (const [rootId, thread] of threadMap) {
    thread.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

    const root = thread[0]!
    const title = cleanTweetText(root.text)
    const replies = thread.slice(1).map(t => cleanTweetText(t.text)).filter(Boolean)
    const summary = replies.length > 0 ? replies.join(' \u00b7 ') : undefined

    items.push({
      id: hash(source.id, rootId),
      sourceId: source.id,
      sourceType: 'twitter',
      sourceName: source.name,
      title,
      url: `https://x.com/${username}/status/${root.id}`,
      summary: summary?.slice(0, 300),
      publishedAt: root.date ? new Date(root.date).toISOString() : new Date().toISOString(),
    })
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

// ── Helpers ──

const extractUsername = (url: string): string | null => {
  const { pathname } = new URL(url)
  const match = pathname.match(/^\/?@?([\w]+)/)
  return match?.[1] ?? null
}

const cleanTweetText = (text: string): string =>
  text.replace(/https:\/\/t\.co\/\w+/g, '').replace(/\s+/g, ' ').trim()
