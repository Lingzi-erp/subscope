import type { SiteRule } from './types.ts'

export const aiRules: SiteRule[] = [
  {
    test: u => u.includes('anthropic.com'),
    selector: 'article',
    title: 'h1',
    cleanTitle: t => t.replace(/\s*[\|–—]\s*Anthropic$/, '').trim(),
    pick: $ => $('[class*="Body-module"][class*="__body"]').first(),
  },
  {
    test: u => /claude\.com\/blog\/.+/.test(u),
    selector: '.u-rich-text-blog',
    title: 'h1',
    pick: $ => {
      const $body = $('.u-rich-text-blog:not(.w-condition-invisible)').first().clone()
      $body.find('figure').remove()
      return $body
    },
  },
  {
    test: u => u.includes('support.claude.com') && u.includes('/articles/'),
    selector: '.article_body article',
    title: 'h1',
    pick: $ => {
      const $article = $('.article_body article').clone()
      $article.find('section.related_articles').remove()
      return $article
    },
  },
  {
    test: u => u.includes('api-docs.deepseek.com'),
    selector: '.theme-doc-markdown.markdown',
    title: 'h1',
    cleanTitle: t => t.replace(/\s*\|.*$/, '').trim(),
  },
  {
    test: u => u.includes('x.ai/news/'),
    selector: 'article, main',
    title: 'h1',
    cleanTitle: t => t.replace(/\s*\|\s*xAI$/, '').trim(),
    pick: $ => {
      const $prose = $('.prose.prose-invert').first().clone()
      if (!$prose.length) return $prose
      $prose.find('[class*="not-prose"]').remove()
      return $prose
    },
  },
  {
    test: u => u.includes('openai.com/index/') || u.includes('openai.com/research/'),
    selector: 'article',
    title: 'h1',
    cleanTitle: t => t.replace(/\s*\|\s*OpenAI$/, '').trim(),
    feedUrl: 'https://openai.com/news/rss.xml',
  },
  {
    test: u => u.includes('deepmind.google'),
    selector: 'main',
    title: 'h1',
    cleanTitle: t => t.replace(/\s*[—–-]\s*Google DeepMind$/, '').trim(),
    feedUrl: 'https://deepmind.google/blog/rss.xml',
    pick: $ => {
      const $main = $('main').clone()
      // Remove "Related Posts" section and any trailing promo sections
      $main.find('section').each((_, el) => {
        if (/related\s+posts/i.test($(el).text())) $(el).remove()
      })
      // Remove the last section if it's a promo (no substantive paragraphs)
      const sections = $main.find('main > section, section').toArray()
      if (sections.length > 0) {
        const last = sections[sections.length - 1]
        if (last && $(last).find('p').length === 0) $(last).remove()
      }
      return $main
    },
  },
  // ── Other ──
  {
    test: u => u.includes('github.com') && /\/releases\/tag\//.test(u),
    selector: '.markdown-body',
    title: 'title',
    cleanTitle: t => t.replace(/\s*·\s*GitHub$/, '').trim(),
    pick: $ => $('[data-test-selector="body-content"]').first(),
  },
]
