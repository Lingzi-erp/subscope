# Command reference

## Reading

```
subscope                          interactive browser (default: formal mode, last 14 days)
subscope quick                    social media only (X + YouTube)
subscope formal                   official sources only (blogs, docs, support)
subscope eco                      economics & finance only (14 econ/* sources)
subscope glob                     global news only (17 news/* sources)
subscope --all / -a               no time filter
subscope -n <count>               limit to N items (non-interactive output)
subscope -g <group>               filter by group (prefix match: -g ai matches ai/*)
subscope --type <type>            filter by source type (website/youtube/twitter)
subscope -j [N] / --json [N]     JSON output (optional limit), pipe-friendly for LLMs
```

Flags combine: `subscope quick -n 5 -g ai/claude`, `subscope glob -j 20`.

### Interactive browser keys

| Key | Action |
|-----|--------|
| up/down, j/k | navigate items |
| enter | open in browser |
| / | jump to search box |
| g | download PDF (academic papers) |
| q | quit |

Search box: type to filter by title, summary, source name, or URL. Enter or down-arrow to browse results. Up past first item returns to search.

NEW badge appears on unseen items. Disappears when you scroll past them. Seen state persists in `~/.subscope/seen.json`.

## Article reader

```
subscope read <url>               fetch article and output clean text (# Title + body)
```

Outputs `# Title\n\ntext` format — pipe-friendly for LLMs. Per-site extractors for all blog-type sources (AI companies + economics institutions). Falls back to Playwright browser for anti-bot sites (BLS, IMF) and Angular SPAs (NFRA — auto-detected and retried with `networkidle`). Tables rendered as Markdown with compound headers flattened to `Group: Column` format. Example:

```
subscope read https://www.federalreserve.gov/newsevents/pressreleases/monetary20260128a.htm
subscope read <url> | llm "summarize the key policy changes"
```

## JSON output

```
subscope glob -j 20               latest 20 global news as JSON array
subscope eco -j                   all econ items as JSON (no limit)
subscope -j 10 -g news/cctv      JSON filtered by group
```

Output: `[{"title":"...","source":"央视网","url":"...","summary":"...","publishedAt":"..."}]`. Clean text, no ANSI codes. Pipe to LLMs or other tools.

## Fetching

```
subscope fetch                    pull all sources (12 concurrent workers)
subscope fetch -g <group>         fetch only matching group
subscope fetch --notify           silent mode, sends Windows toast if new items found
```

Sources stream to terminal as they complete, with per-source timing. Slow sources (>5s) highlighted in yellow. Failed sources retried up to 3 times. Summary shows total time elapsed.

## Background monitoring

```
subscope watch                    foreground, fetch every 10 minutes
subscope watch <minutes>          custom interval
subscope watch-install            register Windows scheduled task (survives reboot)
subscope watch-install <minutes>  custom interval
subscope watch-uninstall          remove scheduled task
```

`watch-install` creates a Windows Task Scheduler job that runs `subscope fetch --notify` at the specified interval. Desktop toast notification when new items arrive. Click notification to open terminal with latest items.

## Sources

```
subscope add <url>                add source (auto-detects type and group)
subscope add <url> -g <group>     add to specific group
subscope rm <id|url>              remove source
subscope ls                       list all sources with group tags
subscope on <id>                  activate source
subscope off <id>                 deactivate source
```

Source IDs are the first 8 chars of the URL's SHA-256 hash.

## Groups

```
subscope group                    list group tree
subscope group <path>             list sources in group (prefix match)
subscope group <path> on          activate group and all children
subscope group <path> off         deactivate group and all children
subscope group <path> add <id>    move source into group
```

Groups are path-based: `ai/anthropic`, `ai/claude`, `photonics`. Operating on `ai` affects all `ai/*` children.

## Modes

```
subscope mode                     list modes with default indicator
subscope mode <name>              set default mode
```

Built-in modes:
- `formal` -- source type `website` in `ai/*` + `photonics/*` groups (blogs, docs, changelogs, support)
- `quick` -- source types `youtube`, `twitter`
- `eco` -- group prefix `econ` (Fed, ECB, PBOC, BOJ, NBS, BLS, BEA, SEC EDGAR, US Treasury, IMF, CSRC, MOF, SAFE, NFRA)
- `glob` -- group prefix `news` (BBC, France24, DW, NHK, Al Jazeera, TASS, Yonhap, AP, ABC AU, CBC, CCTV, Xinhua, People's Daily, Focus Taiwan, The Hindu)

Modes can filter by source type (`types`) and/or group prefix (`groups`). `-g` flag bypasses mode filtering and shows all source types in that group.

## Auth

```
subscope auth x                   read X auth_token from clipboard
subscope auth x <token>           set manually
subscope auth academic            read academic cookies from clipboard
subscope auth academic <cookies>  set manually
```

Both commands try clipboard first (PowerShell Get-Clipboard). Copy the value in DevTools, run the command.

X/Twitter: F12, Application, Cookies, copy `auth_token` value.
Academic: F12, Network, click any request, copy full Cookie header value.

## Interactive config

```
subscope config
```

### Folder mode (default)

| Key | Action |
|-----|--------|
| up/down | navigate |
| space | toggle on/off (cascades to children) |
| right | drill into folder |
| left | go back |
| s | enter source management |
| n | new folder |
| e | rename folder |
| d | delete empty folder |
| q | save and quit |

### Source mode (press s)

| Key | Action |
|-----|--------|
| up/down | navigate |
| space | toggle source on/off |
| a | add source from catalog |
| e | edit source name |
| d | delete source |
| q | back to folder mode |

### Add source (press a in source mode)

Type to search the catalog. Up/down to select. Enter to add. Template sources (YouTube, X, GitHub) prompt for a handle. Pre-defined sources hidden once added.

## Files

```
~/.subscope/config.yml            sources, groups, modes, folders, active states
~/.subscope/subscope.db           SQLite feed item cache
~/.subscope/auth.yml              X auth_token + academic cookies
~/.subscope/seen.json             read tracking for NEW badges
```
