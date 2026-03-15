// Node-only script — extracts X auth_token via Playwright
// Usage: node x-auth.cjs
// Output: auth_token value to stdout

const { chromium } = require('playwright')

async function main() {
  // Try headless first — check if existing Chrome profile has cookies
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
  })

  const context = await browser.newContext()
  const page = await context.newPage()

  // Navigate to X
  await page.goto('https://x.com/home', {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  })

  // Check if we're logged in (redirected to login page or home)
  const url = page.url()
  const isLoggedIn = !url.includes('/login') && !url.includes('/i/flow')

  if (isLoggedIn) {
    // Already logged in — grab cookie
    const cookies = await context.cookies('https://x.com')
    const authToken = cookies.find(c => c.name === 'auth_token')?.value
    if (authToken) {
      await browser.close()
      process.stdout.write(authToken)
      return
    }
  }

  // Not logged in — show visible browser for user to log in
  await browser.close()

  const browser2 = await chromium.launch({
    headless: false,
    channel: 'chrome',
  })
  const context2 = await browser2.newContext()
  const page2 = await context2.newPage()

  await page2.goto('https://x.com/login', {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  })

  // Wait for user to log in — poll for auth_token cookie
  process.stderr.write('Waiting for login...\n')

  let token = null
  for (let i = 0; i < 120; i++) {  // 2 minutes max
    await page2.waitForTimeout(1000)
    const cookies = await context2.cookies('https://x.com')
    const found = cookies.find(c => c.name === 'auth_token')
    if (found) {
      token = found.value
      break
    }
  }

  await browser2.close()

  if (token) {
    process.stdout.write(token)
  } else {
    process.stderr.write('Login timed out.\n')
    process.exit(1)
  }
}

main().catch(err => {
  process.stderr.write(err.message + '\n')
  process.exit(1)
})
