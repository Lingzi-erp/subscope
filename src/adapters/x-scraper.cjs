// Node-only script — called by Bun via subprocess
// Bun can't run Playwright (pipe issue on Windows), so we use Node
//
// Usage: node x-scraper.cjs <username> <auth_token>
// Output: JSON array of { id, text, date, replyToId } to stdout

const { chromium } = require('playwright')

const [,, username, authToken] = process.argv

if (!username || !authToken) {
  console.error('Usage: node x-scraper.cjs <username> <auth_token>')
  process.exit(1)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()

  await context.addCookies([{
    name: 'auth_token',
    value: authToken,
    domain: '.x.com',
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'None',
  }])

  const page = await context.newPage()

  // Intercept API calls to capture tweet data with reply relationships
  const tweetData = new Map()
  page.on('response', async (response) => {
    const url = response.url()
    if (!url.includes('/UserTweets') && !url.includes('/UserByScreenName')) return
    try {
      const json = await response.json()
      extractTweets(json, tweetData)
    } catch {}
  })

  await page.goto(`https://x.com/${username}`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  })

  await page.waitForSelector('article', { timeout: 10000 }).catch(() => {})
  await page.evaluate(() => window.scrollTo(0, 3000))
  await page.waitForTimeout(2000)

  await browser.close()

  // Convert to output format
  const tweets = []
  for (const [id, t] of tweetData) {
    if (t.userId !== username.toLowerCase()) continue // only this user's tweets
    tweets.push({
      id,
      text: (t.text || '').replace(/\n/g, ' '),
      date: t.date || '',
      replyToId: t.replyToId || null,
      convId: t.convId || id,
    })
  }

  process.stdout.write(JSON.stringify(tweets))
}

// Recursively extract tweet objects from X API response
function extractTweets(obj, map) {
  if (!obj || typeof obj !== 'object') return
  if (obj.tweet_results?.result || obj.__typename === 'Tweet') {
    const tweet = obj.tweet_results?.result?.legacy || obj.legacy || obj
    const core = obj.tweet_results?.result?.core || obj.core
    const id = tweet.id_str || obj.rest_id
    if (id && tweet.full_text) {
      const screenName = core?.user_results?.result?.legacy?.screen_name?.toLowerCase() || ''
      map.set(id, {
        text: tweet.full_text,
        date: tweet.created_at || '',
        replyToId: tweet.in_reply_to_status_id_str || null,
        convId: tweet.conversation_id_str || id,
        userId: screenName,
      })
    }
  }
  for (const val of Object.values(obj)) {
    if (typeof val === 'object') extractTweets(val, map)
  }
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
