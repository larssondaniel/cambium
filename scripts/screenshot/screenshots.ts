/**
 * Renders the README hero: Cambium's comment for the example fixture pair,
 * as a GitHub-style comment card, captured in light and dark.
 *
 * The markdown comes from Cambium's own renderer, so the image cannot drift
 * from the product. It is turned into HTML with marked, styled with
 * github-markdown-css and the stage stylesheet next to this file, and
 * captured with Playwright's Chromium at 2x.
 *
 * Determinism: the page uses the bundled Inter and JetBrains Mono fonts, not
 * the system stack, and the pinned Chromium build. Text rasterisation still
 * differs between operating systems, so the committed images are the output
 * of the Check screenshots workflow on ubuntu-latest, which fails when they
 * are stale and uploads the fresh pair as an artifact to commit.
 *
 * Run with `npm run screenshots`.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { marked } from 'marked'
import { chromium } from 'playwright'
import { diffSchemas } from '../../src/diff/index.js'
import { render } from '../../src/render.js'
import { loadSchema } from '../../src/schema-file.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const fixtures = join(root, '__fixtures__/schemas/example')
const outDir = join(root, 'docs/images')
const modules = join(root, 'node_modules')

const THEMES = ['light', 'dark'] as const

function commentMarkdown(): string {
  const read = (name: string) => readFileSync(join(fixtures, name), 'utf8')
  const base = loadSchema(read('base.graphql'), 'schema.graphql', {
    label: 'base',
    sha: 'base'
  })
  const head = loadSchema(read('head.graphql'), 'schema.graphql', {
    label: 'head',
    sha: 'head'
  })
  return render({
    event: 'changed',
    schemaPath: 'schema.graphql',
    changes: diffSchemas(base, head)
  })
}

function fontFace(family: string, weight: number, file: string): string {
  const url = pathToFileURL(join(modules, '@fontsource', file)).href
  return `@font-face { font-family: "${family}"; font-weight: ${weight}; font-style: normal; src: url("${url}") format("woff2"); }`
}

function page(theme: (typeof THEMES)[number], body: string): string {
  const template = readFileSync(join(here, 'page.html'), 'utf8')
  const fill: Record<string, string> = {
    theme,
    body,
    fontCss: [
      fontFace('Inter', 400, 'inter/files/inter-latin-400-normal.woff2'),
      fontFace('Inter', 600, 'inter/files/inter-latin-600-normal.woff2'),
      fontFace(
        'JetBrains Mono',
        400,
        'jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2'
      )
    ].join('\n'),
    markdownCss: readFileSync(
      join(modules, 'github-markdown-css', `github-markdown-${theme}.css`),
      'utf8'
    ),
    stageCss: readFileSync(join(here, 'stage.css'), 'utf8')
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => fill[key])
}

async function main(): Promise<void> {
  const markdown = commentMarkdown()
  // The README shows the safe section expanded; the live comment collapses it.
  const body = (await marked.parse(markdown, { gfm: true })).replace(
    '<details>',
    '<details open>'
  )

  mkdirSync(outDir, { recursive: true })
  const scratch = mkdtempSync(join(tmpdir(), 'cambium-screenshot-'))
  const browser = await chromium.launch()
  try {
    for (const theme of THEMES) {
      const file = join(scratch, `${theme}.html`)
      writeFileSync(file, page(theme, body))
      const context = await browser.newContext({
        viewport: { width: 900, height: 1200 },
        deviceScaleFactor: 2,
        colorScheme: theme
      })
      const tab = await context.newPage()
      await tab.goto(pathToFileURL(file).href)
      await tab.evaluate(() => document.fonts.ready)
      const path = join(outDir, `comment-${theme}.png`)
      await tab.locator('.stage').screenshot({ path, animations: 'disabled' })
      console.log(`wrote ${path}`)
      await context.close()
    }
  } finally {
    await browser.close()
  }
}

await main()
