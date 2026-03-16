import type * as cheerio from 'cheerio'

export interface SiteRule {
  test: (url: string) => boolean
  selector: string
  headers?: Record<string, string>
  title?: string
  cleanTitle?: (t: string) => string
  pick?: ($: cheerio.CheerioAPI) => cheerio.Cheerio<any>
  feedUrl?: string
}
