// Node-only script — called by Bun via subprocess
// Bun can't run Playwright (pipe issue on Windows), so we use Node
//
// Usage: node x-scraper.cjs <username> <auth_token>
// Output: JSON array of { id, text, date } to stdout

const { chromium } = require('playwright')

const [,, username, authToken] = process.argv

if (!username || !authToken) {
  console.error('Usage: node x-scraper.cjs <username> <auth_token>')
  process.exit(1)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()

  // Set auth cookie
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
  await page.goto(`https://x.com/${username}`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  })

  // Wait for tweets to load
  await page.waitForSelector('article', { timeout: 10000 }).catch(() => {})

  // Scroll once to load more
  await page.evaluate(() => window.scrollTo(0, 3000))
  await page.waitForTimeout(1500)

  const articles = await page.locator('article').all()
  const tweets = []

  for (const article of articles) {
    try {
      const text = await article.locator('[data-testid="tweetText"]').innerText().catch(() => '')
      const time = await article.locator('time').getAttribute('datetime').catch(() => '')
      const link = await article.locator('a[href*="/status/"]').first().getAttribute('href').catch(() => '')
      const id = link?.match(/\/status\/(\d+)/)?.[1] ?? ''

      if (text && id) {
        tweets.push({ id, text: text.replace(/\n/g, ' '), date: time })
      }
    } catch {}
  }

  await browser.close()

  // Output JSON to stdout
  process.stdout.write(JSON.stringify(tweets))
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
