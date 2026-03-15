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
    if (!res.ok) return []

    const html = await res.text()
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
    if (!match) return []

    const data = JSON.parse(match[1]!)
    const entries: any[] = data?.props?.pageProps?.timeline?.entries ?? []

    const items: FeedItem[] = []
    for (const entry of entries) {
      const tweet = entry?.content?.tweet
      if (!tweet?.text || !tweet?.id_str) continue
      if (tweet.retweeted_status_result) continue

      items.push({
        id: hash(source.id, tweet.id_str),
        sourceId: source.id,
        sourceType: 'twitter',
        sourceName: source.name,
        title: cleanTweetText(tweet.text),
        url: `https://x.com/${username}/status/${tweet.id_str}`,
        publishedAt: new Date(tweet.created_at).toISOString(),
      })
    }

    return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  } catch {
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

    const tweets: { id: string; text: string; date: string }[] = JSON.parse(stdout)

    return tweets.map(t => ({
      id: hash(source.id, t.id),
      sourceId: source.id,
      sourceType: 'twitter' as const,
      sourceName: source.name,
      title: cleanTweetText(t.text),
      url: `https://x.com/${username}/status/${t.id}`,
      publishedAt: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
    })).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
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

// ── Helpers ──

const extractUsername = (url: string): string | null => {
  const { pathname } = new URL(url)
  const match = pathname.match(/^\/?@?([\w]+)/)
  return match?.[1] ?? null
}

const cleanTweetText = (text: string): string =>
  text.replace(/https:\/\/t\.co\/\w+/g, '').replace(/\s+/g, ' ').trim()
