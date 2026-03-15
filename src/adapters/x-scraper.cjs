// Node-only script — scrapes multiple X profiles with ONE browser
// Usage: node x-scraper.cjs <auth_token> <username1> <username2> ...
// Output: JSON object { username: [{id, text, date, replyToId, convId}] } to stdout

const { chromium } = require('playwright')

const [,, authToken, ...usernames] = process.argv

if (!authToken || usernames.length === 0) {
  console.error('Usage: node x-scraper.cjs <auth_token> <user1> [user2] ...')
  process.exit(1)
}

async function main() {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--headless=new'],
  })
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

  const results = {}

  for (const username of usernames) {
    try {
      process.stderr.write(`  scraping @${username}...\n`)
      results[username] = await scrapePage(context, username)
    } catch (err) {
      process.stderr.write(`  @${username} failed: ${err.message}\n`)
      results[username] = []
    }
  }

  await browser.close()
  process.stdout.write(JSON.stringify(results))
}

async function scrapePage(context, username) {
  const page = await context.newPage()

  await page.goto(`https://x.com/${username}`, {
    waitUntil: 'load',
    timeout: 20000,
  })

  await page.waitForSelector('article', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1000)

  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(1500)
  }

  const tweets = await page.evaluate((targetUser) => {
    const articles = document.querySelectorAll('article')
    const results = []

    for (const article of articles) {
      const textEl = article.querySelector('[data-testid="tweetText"]')
      const timeEl = article.querySelector('time')
      const statusLink = article.querySelector('a[href*="/status/"]')

      if (!textEl || !statusLink) continue

      const href = statusLink.getAttribute('href') || ''
      const idMatch = href.match(/\/status\/(\d+)/)
      if (!idMatch) continue

      const tweetUser = href.split('/')[1]?.toLowerCase() || ''
      if (tweetUser !== targetUser.toLowerCase()) continue

      results.push({
        id: idMatch[1],
        text: textEl.innerText || '',
        date: timeEl ? timeEl.getAttribute('datetime') : '',
      })
    }
    return results
  }, username)

  await page.close()

  // Detect threads
  const ONE_HOUR = 3600_000
  for (let i = 0; i < tweets.length; i++) {
    tweets[i].replyToId = null
    tweets[i].convId = tweets[i].id
  }

  for (let i = 1; i < tweets.length; i++) {
    const prev = tweets[i - 1]
    const curr = tweets[i]
    if (!prev.date || !curr.date) continue

    const gap = Math.abs(new Date(curr.date).getTime() - new Date(prev.date).getTime())
    if (gap < ONE_HOUR) {
      let rootIdx = i - 1
      while (rootIdx > 0 && tweets[rootIdx].replyToId !== null) rootIdx--
      curr.replyToId = prev.id
      for (let j = rootIdx; j <= i; j++) tweets[j].convId = tweets[rootIdx].id
    }
  }

  return tweets
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
