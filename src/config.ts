import { parse, stringify } from 'yaml'
import { join } from 'path'
import { homedir } from 'os'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import type { Source } from './types.ts'

export interface Config {
  sources: Source[]
}

const SUBSCOPE_DIR = join(homedir(), '.subscope')
const CONFIG_FILE = join(SUBSCOPE_DIR, 'config.yml')

const ensureDir = () => {
  if (!existsSync(SUBSCOPE_DIR)) mkdirSync(SUBSCOPE_DIR, { recursive: true })
}

export const load = (): Config => {
  ensureDir()
  if (!existsSync(CONFIG_FILE)) return { sources: [] }
  const raw = readFileSync(CONFIG_FILE, 'utf-8')
  return (parse(raw) as Config) ?? { sources: [] }
}

export const save = (config: Config): void => {
  ensureDir()
  writeFileSync(CONFIG_FILE, stringify(config))
}

export const addSource = (config: Config, source: Source): Config => ({
  ...config,
  sources: [...config.sources, source],
})

export const removeSource = (config: Config, id: string): Config => ({
  ...config,
  sources: config.sources.filter(s => s.id !== id),
})
