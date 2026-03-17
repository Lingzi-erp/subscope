import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { hash, item, sortDesc, DIR, UA } from '../lib.ts'
import type { Source, FeedItem, SourceAdapter } from '../types.ts'

const UID_CACHE_FILE = join(DIR, 'x-uid-cache.json')

const BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

const FEATURES = JSON.stringify({
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_consumption_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  standardized_nudges_misinfo: true,
})

const USER_FEATURES = JSON.stringify({
  hidden_profile_subscriptions_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
})

export const twitter: SourceAdapter = {
  type: 'twitter',
  test: (url: string) => {
    const { hostname } = new URL(url)
    return hostname.includes('twitter.com') || hostname.includes('x.com')
  },

  async fetch(source: Source): Promise<FeedItem[]> {
    const username = source.url.match(/(?:x\.com|twitter\.com)\/?@?([\w]+)/)?.[1]
    if (!username) return []

    const gt = await getGuestToken()
    let userId = getCachedUid(username)
    if (!userId) {
      userId = await resolveUserId(gt, username)
      if (!userId) throw new Error(`X: user "${username}" not found`)
      cacheUid(username, userId)
    }
    return mergeThreads(await fetchUserTweets(gt, userId), username, source)
  },
}

// ── Guest Token (shared across all X sources per fetch cycle) ──

let guestTokenPromise: Promise<string> | null = null

const getGuestToken = (): Promise<string> => {
  if (guestTokenPromise) return guestTokenPromise
  guestTokenPromise = (async () => {
    const res = await fetch('https://api.twitter.com/1.1/guest/activate.json', {
      method: 'POST',
      headers: { Authorization: `Bearer ${BEARER}` },
    })
    if (!res.ok) throw new Error(`X guest token: ${res.status}`)
    return ((await res.json()) as any).guest_token as string
  })()
  return guestTokenPromise
}

const apiHeaders = (guestToken: string) => ({
  Authorization: `Bearer ${BEARER}`,
  'X-Guest-Token': guestToken,
})

// ── User ID cache ──

let uidCache: Record<string, string> | null = null

const loadUidCache = (): Record<string, string> => {
  if (uidCache) return uidCache
  try {
    if (existsSync(UID_CACHE_FILE))
      return (uidCache = JSON.parse(readFileSync(UID_CACHE_FILE, 'utf-8')))
  } catch {}
  return (uidCache = {})
}

const getCachedUid = (username: string): string | null =>
  loadUidCache()[username.toLowerCase()] ?? null

const cacheUid = (username: string, userId: string) => {
  const cache = loadUidCache()
  cache[username.toLowerCase()] = userId
  try { writeFileSync(UID_CACHE_FILE, JSON.stringify(cache)) } catch {}
}

// ── GraphQL API ──

const resolveUserId = async (guestToken: string, username: string): Promise<string | null> => {
  const variables = JSON.stringify({ screen_name: username })
  const url = `https://x.com/i/api/graphql/xc8f1g7BYqr6VTzTbvNlGw/UserByScreenName?variables=${encodeURIComponent(variables)}&features=${encodeURIComponent(USER_FEATURES)}`
  const res = await fetch(url, { headers: apiHeaders(guestToken) })
  if (!res.ok) return null
  return ((await res.json()) as any)?.data?.user?.result?.rest_id ?? null
}

const fetchUserTweets = async (guestToken: string, userId: string): Promise<RawTweet[]> => {
  const variables = JSON.stringify({
    userId, count: 40,
    includePromotedContent: false,
    withQuickPromoteEligibilityTweetFields: false,
    withVoice: false, withV2Timeline: true,
  })
  const url = `https://x.com/i/api/graphql/E3opETHurmVJflFsUBVuUQ/UserTweets?variables=${encodeURIComponent(variables)}&features=${encodeURIComponent(FEATURES)}`
  const res = await fetch(url, { headers: apiHeaders(guestToken) })
  if (!res.ok) throw new Error(`X API: ${res.status}`)

  const tweets: RawTweet[] = []
  const seen = new Set<string>()

  const walk = (obj: any) => {
    if (!obj || typeof obj !== 'object') return
    const legacy = obj.legacy
    if (legacy?.full_text && legacy?.id_str && !seen.has(legacy.id_str)) {
      seen.add(legacy.id_str)
      tweets.push({
        id: legacy.id_str,
        text: legacy.full_text,
        date: legacy.created_at,
        convId: legacy.conversation_id_str ?? legacy.id_str,
        replyToId: legacy.in_reply_to_status_id_str ?? null,
      })
    }
    for (const v of Object.values(obj)) {
      if (typeof v === 'object') walk(v)
    }
  }

  walk(await res.json())
  return tweets
}

// ── Thread merging ──

type RawTweet = { id: string; text: string; date: string; replyToId: string | null; convId: string }

const mergeThreads = (tweets: RawTweet[], username: string, source: Source): FeedItem[] => {
  const byId = new Map<string, RawTweet>()
  for (const t of tweets) byId.set(t.id, t)

  const threadMap = new Map<string, RawTweet[]>()
  const assigned = new Set<string>()

  for (const tweet of byId.values()) {
    if (assigned.has(tweet.id)) continue
    let rootId = tweet.id
    let current = tweet
    while (current.replyToId && byId.has(current.replyToId)) {
      rootId = current.replyToId
      current = byId.get(current.replyToId)!
    }
    if (byId.has(tweet.convId)) rootId = tweet.convId
    const group = threadMap.get(rootId) ?? []
    group.push(tweet)
    assigned.add(tweet.id)
    threadMap.set(rootId, group)
  }

  const items: FeedItem[] = []
  for (const [rootId, thread] of threadMap) {
    thread.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const root = thread[0]!
    const replies = thread.slice(1).map(t => cleanTweet(t.text)).filter(Boolean)

    items.push(item(source, `https://x.com/${username}/status/${root.id}`, cleanTweet(root.text), {
      key: rootId,
      summary: replies.length > 0 ? replies.join(' \u00b7 ').slice(0, 300) : undefined,
      publishedAt: root.date ? new Date(root.date).toISOString() : undefined,
    }))
  }

  return sortDesc(items)
}

const cleanTweet = (text: string): string =>
  text.replace(/https:\/\/t\.co\/\w+/g, '').replace(/\s+/g, ' ').trim()
