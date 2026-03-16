import { load, save, type Config } from './config.ts'
import { groupMatches } from './lib.ts'
import type { Source } from './types.ts'

// ── ANSI (shared names with render.ts) ──

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const CYAN = '\x1b[36m'
const GRAY = '\x1b[90m'
const YELLOW = '\x1b[33m'
const WHITE = '\x1b[37m'
const BG_BAR = '\x1b[48;5;236m'

const cols = () => process.stdout.columns || 80
const rows = () => process.stdout.rows || 24

// ── State machine ──

type Mode =
  | { kind: 'folders' }
  | { kind: 'text'; purpose: 'new-folder' | 'rename-folder'; buf: string; meta?: any }

export const interactiveConfig = (): Promise<void> => {
  const cfg = load()
  const nav: { path: string; cursor: number }[] = [{ path: '', cursor: 0 }]
  let mode: Mode = { kind: 'folders' }
  let dirty = false

  const cur = () => nav[nav.length - 1]!

  // ── Data helpers ──

  const allFolders = () => {
    const set = new Set<string>()
    for (const f of cfg.folders) set.add(f)
    for (const s of cfg.sources) set.add(s.group)
    for (const g of cfg.activeGroups) set.add(g)
    // Add parent paths
    for (const p of [...set]) {
      const parts = p.split('/')
      for (let i = 1; i < parts.length; i++) set.add(parts.slice(0, i).join('/'))
    }
    return set
  }

  const childFolders = (path: string) => {
    const prefix = path ? path + '/' : ''
    const children = new Set<string>()
    for (const f of allFolders()) {
      if (!f.startsWith(prefix)) continue
      const rest = f.slice(prefix.length)
      if (!rest || rest.includes('/')) continue
      children.add(rest)
    }
    return [...children].sort()
  }

  const sourcesIn = (path: string): Source[] => {
    if (!path) return cfg.sources
    return cfg.sources.filter(s => groupMatches(s.group, path))
  }

  const isActive = (path: string) =>
    cfg.activeGroups.some(g => groupMatches(g, path))

  // ── Folder rows ──

  type Row = { kind: 'label' | 'gap' | 'mode' | 'folder' | 'source'; key?: string; text: string; active?: boolean }

  const folderRows = (): Row[] => {
    const r: Row[] = []
    const p = cur().path
    if (!p) {
      r.push({ kind: 'label', text: 'Default Mode' })
      for (const [name, m] of Object.entries(cfg.modes))
        r.push({ kind: 'mode', key: name, text: `${name}  ${DIM}${[m.types?.join(', '), m.groups?.map(g => `[${g}]`).join(', ')].filter(Boolean).join(' ')}${RESET}`, active: cfg.defaultMode === name })
      r.push({ kind: 'gap', text: '' })
      r.push({ kind: 'label', text: 'Groups' })
    }
    const folders = childFolders(p)
    for (const f of folders) {
      const full = p ? `${p}/${f}` : f
      const all = sourcesIn(full)
      const on = all.filter(s => s.active).length
      r.push({ kind: 'folder', key: full, text: `${f}  ${DIM}${on}/${all.length}${RESET}`, active: isActive(full) })
    }
    // Show sources directly in this folder
    const directSources = cfg.sources.filter(s => s.group === p)
    if (directSources.length > 0 && folders.length > 0) {
      r.push({ kind: 'gap', text: '' })
      r.push({ kind: 'label', text: 'Sources' })
    }
    for (const s of directSources) {
      r.push({ kind: 'source', key: s.id, text: `${s.name}  ${DIM}${s.type}${RESET}`, active: s.active })
    }
    return r
  }

  const selectable = (r: Row) => r.kind === 'mode' || r.kind === 'folder' || r.kind === 'source'
  const findSel = (rows: Row[], from: number, dir: 1 | -1) => {
    let i = from + dir
    while (i >= 0 && i < rows.length) { if (selectable(rows[i]!)) return i; i += dir }
    return from
  }
  const firstSel = (rows: Row[]) => { for (let i = 0; i < rows.length; i++) if (selectable(rows[i]!)) return i; return 0 }

  // ── Toggle ──

  const toggleFolder = (path: string) => {
    const paths = new Set<string>()
    for (const f of allFolders()) if (groupMatches(f, path)) paths.add(f)
    for (const s of cfg.sources) if (groupMatches(s.group, path)) paths.add(s.group)
    if (isActive(path)) {
      cfg.activeGroups = cfg.activeGroups.filter(g => !paths.has(g))
    } else {
      for (const p of paths) if (!cfg.activeGroups.includes(p)) cfg.activeGroups.push(p)
    }
  }

  // ── Render ──

  const CLR = '\x1b[K'
  const render = (lines: string[], hint: string) => {
    while (lines.length < rows() - 2) lines.push('')
    const pad = Math.max(0, cols() - hint.length - 4)
    const mark = dirty ? `${CYAN}*${RESET} ` : '  '
    lines.push(`${BG_BAR}${WHITE} ${mark}${DIM}${hint}${' '.repeat(pad)}${RESET}`)
    process.stdout.write(`\x1b[H\x1b[?25l` + lines.map(l => l + CLR).join('\n') + '\x1b[J')
  }

  const draw = () => {
    const lines: string[] = []
    const path = cur().path

    if (mode.kind === 'folders') {
      const bc = path ? path.split('/').map(p => `${BOLD}${p}${RESET}`).join(` ${DIM}/${RESET} `) : `${BOLD}subscope config${RESET}`
      lines.push(`  ${bc}`)
      lines.push('')
      const rows = folderRows()
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]!
        if (r.kind === 'gap') { lines.push(''); continue }
        if (r.kind === 'label') { lines.push(`  ${DIM}${r.text}${RESET}`); continue }
        const sel = i === cur().cursor
        const ptr = sel ? `${CYAN}\u203a${RESET}` : ' '
        const ico = r.kind === 'folder'
          ? (r.active ? `${CYAN}\u25b8${RESET}` : `${GRAY}\u25b8${RESET}`)
          : (r.active ? `${CYAN}\u25cf${RESET}` : `${GRAY}\u25cb${RESET}`)
        const lbl = sel ? `${BOLD}${r.text}${RESET}` : r.text
        const arrow = sel && r.kind === 'folder' ? `  ${DIM}\u2192${RESET}` : ''
        const tag = r.kind === 'mode' && r.active ? `  ${DIM}(default)${RESET}` : ''
        lines.push(` ${ptr} ${ico} ${lbl}${tag}${arrow}`)
      }
      render(lines, path
        ? '\u2191\u2193 move  space toggle  \u2192 open  \u2190 back  n new  e rename  d del  q save'
        : '\u2191\u2193 move  space toggle  \u2192 open  n new  e rename  d del  q save')

    } else if (mode.kind === 'text') {
      const label = mode.purpose === 'new-folder' ? 'New folder' : 'Rename'
      lines.push(`  ${BOLD}${label}${RESET}`)
      lines.push('')
      lines.push(`  ${YELLOW}${mode.buf}\u2588${RESET}`)
      render(lines, 'enter confirm  q cancel')
    }
  }

  // ── Key handling ──

  process.stdout.write('\x1b[?1049h')
  draw()

  return new Promise<void>(resolve => {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf-8')

    const quit = () => {
      if (dirty) save(cfg)
      process.stdout.write('\x1b[?25h\x1b[?1049l')
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.removeListener('data', onKey)
      if (dirty) console.log('\n  Config saved.\n')
      resolve()
    }

    const onKey = (key: string) => {
      const up = key === '\x1b[A' || key === 'k'
      const down = key === '\x1b[B' || key === 'j'
      const right = key === '\x1b[C' || key === 'l'
      const left = key === '\x1b[D' || key === 'h'
      const enter = key === '\r'
      const ctrlc = key === '\x03'
      const backspace = key === '\x7f' || key === '\b'
      const printable = key.length === 1 && key.charCodeAt(0) >= 32

      // ── FOLDERS ──
      if (mode.kind === 'folders') {
        const rows = folderRows()
        if (up) { cur().cursor = findSel(rows, cur().cursor, -1); draw(); return }
        if (down) { cur().cursor = findSel(rows, cur().cursor, 1); draw(); return }
        if (key === ' ') {
          const r = rows[cur().cursor]
          if (r?.kind === 'mode') { cfg.defaultMode = r.key!; dirty = true; draw() }
          else if (r?.kind === 'folder') { toggleFolder(r.key!); dirty = true; draw() }
          else if (r?.kind === 'source') { const s = cfg.sources.find(x => x.id === r.key); if (s) { s.active = !s.active; dirty = true; draw() } }
          return
        }
        if (right) {
          const r = rows[cur().cursor]
          if (r?.kind === 'folder') { nav.push({ path: r.key!, cursor: 0 }); cur().cursor = firstSel(folderRows()); draw() }
          return
        }
        if (left) { if (nav.length > 1) { nav.pop(); draw() }; return }
        if (key === 'n') { mode = { kind: 'text', purpose: 'new-folder', buf: '' }; draw(); return }
        if (key === 'e') {
          const r = rows[cur().cursor]
          if (r?.kind === 'folder') mode = { kind: 'text', purpose: 'rename-folder', buf: r.key!.split('/').pop()!, meta: r.key }
          draw(); return
        }
        if (key === 'd') {
          const r = rows[cur().cursor]
          if (r?.kind === 'folder') {
            const p = r.key!
            if (!cfg.sources.some(s => groupMatches(s.group, p))) {
              cfg.folders = cfg.folders.filter(f => !groupMatches(f, p))
              cfg.activeGroups = cfg.activeGroups.filter(g => !groupMatches(g, p))
              dirty = true
              const newRows = folderRows()
              cur().cursor = Math.min(cur().cursor, Math.max(0, newRows.length - 1))
            }
          }
          draw(); return
        }
        if (key === 'q' || enter || ctrlc) { quit(); return }
        return
      }

      // ── TEXT INPUT ──
      if (mode.kind === 'text') {
        const m = mode
        if (enter) {
          const val = m.buf.trim()
          if (val) {
            if (m.purpose === 'new-folder') {
              const p = cur().path ? `${cur().path}/${val}` : val
              if (!cfg.folders.includes(p)) cfg.folders.push(p)
              if (!cfg.activeGroups.includes(p)) cfg.activeGroups.push(p)
              dirty = true
            } else if (m.purpose === 'rename-folder') {
              const oldPath = m.meta as string
              const newPath = cur().path ? `${cur().path}/${val}` : val
              const rn = (p: string) => p === oldPath ? newPath : p.startsWith(oldPath + '/') ? newPath + p.slice(oldPath.length) : p
              cfg.folders = cfg.folders.map(rn)
              cfg.activeGroups = cfg.activeGroups.map(rn)
              cfg.sources.forEach(s => { s.group = rn(s.group) })
              dirty = true
            }
          }
          mode = { kind: 'folders' }
          draw(); return
        }
        if (key === 'q' && m.buf === '' || ctrlc) {
          mode = { kind: 'folders' }
          draw(); return
        }
        if (backspace) { m.buf = m.buf.slice(0, -1); draw(); return }
        if (printable) { m.buf += key; draw(); return }
        return
      }
    }

    process.stdin.on('data', onKey)
  })
}

