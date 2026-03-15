// Node-only script — gets X auth_token via browser login
// Usage: node x-auth.cjs
// Output: auth_token value to stdout

const { chromium } = require('playwright')

async function main() {
  // Launch Playwright's Chromium (not system Chrome — avoids profile lock)
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('https://x.com/login', {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  })

  process.stderr.write('Please log in to X in the browser window...\n')

  // Poll for auth_token cookie (3 minutes max)
  let token = null
  for (let i = 0; i < 180; i++) {
    await page.waitForTimeout(1000)
    const cookies = await context.cookies('https://x.com')
    const found = cookies.find(c => c.name === 'auth_token')
    if (found) {
      token = found.value
      break
    }
  }

  await browser.close()

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
