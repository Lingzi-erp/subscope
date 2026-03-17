import { join } from 'path'
import { UA } from './lib.ts'

// Playwright via system Chrome — anti-bot bypass for BLS, IMF, etc.
// Spawned through node (not Bun) due to oven-sh/bun#27977
// ASYNC: uses Bun.spawn to avoid blocking the event loop.
export const fetchWithBrowser = async (url: string, waitUntil: 'domcontentloaded' | 'networkidle' = 'domcontentloaded'): Promise<string> => {
  const projectRoot = join(import.meta.dir, '..')
  const script = [
    `const{chromium}=require('playwright');`,
    `(async()=>{`,
    `const b=await chromium.launch({headless:true,channel:'chrome',`,
    `args:['--disable-blink-features=AutomationControlled','--ignore-certificate-errors']});`,
    `const ctx=await b.newContext({ignoreHTTPSErrors:true,userAgent:${JSON.stringify(UA)}});`,
    `const p=await ctx.newPage();`,
    `await p.addInitScript(()=>{Object.defineProperty(navigator,'webdriver',{get:()=>false})});`,
    `await p.goto(${JSON.stringify(url)},{waitUntil:'${waitUntil}',timeout:20000});`,
    `process.stdout.write(await p.content());`,
    `await b.close();`,
    `})().catch(e=>{process.stderr.write(e.message);process.exit(1)});`,
  ].join('')
  const proc = Bun.spawn(['node', '-e', script], {
    stdout: 'pipe', stderr: 'pipe',
    cwd: projectRoot,
    env: { ...process.env, NODE_PATH: join(projectRoot, 'node_modules') },
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited
  if (code !== 0) {
    throw new Error(`Browser fetch failed: ${stderr.trim() || 'unknown error'}`)
  }
  return stdout
}
