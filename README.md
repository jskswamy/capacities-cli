# capacities-cli

An unofficial community CLI for [Capacities](https://capacities.io) — script and automate your knowledge base from the terminal.

> **Beta.** This is a community tool built while an official CLI does not exist. Once Capacities ships an official CLI, this project will align its UX with the official tool and retire or evolve depending on what the official one covers. If the official one is open-sourced, relevant contributions will go upstream.

## What it does

- **Multiple spaces** — manage personal, work, and other Capacities spaces from one tool, switching with a flag or an environment variable
- **Local cache** — search results are cached for 10 minutes, object content for 1 hour, structure definitions for 24 hours; most repeated reads hit disk, not the API
- **Secure secrets** — tokens are encrypted with [age](https://age-encryption.org) before being written to disk; the CLI never echoes or logs them
- **Scripting-friendly** — `--json` output, `--quiet` + exit codes, `CAPACITIES_TOKEN` for CI

This is not a replacement for the Capacities MCP server. MCP is ideal for AI-assisted workflows inside editors; this CLI is for shell scripts, cron jobs, and terminal workflows where you want direct control.

## Installation

```bash
npm install -g capacities-cli
```

Requires Node >= 20.

## Setup

### 1. Generate an age keypair

age encrypts your API tokens at rest. The private key lives only on your machine.

```bash
capacities auth keygen
# Writes ~/.age/key.txt  — never commit this file
# Prints the public recipient key (used internally for encryption)
```

> **Why age?** Your Capacities API token grants full read/write access to your knowledge base. Storing it as plaintext in a config file means any process that can read your home directory can exfiltrate it. age encryption means the token is useless without the key file, which stays offline and out of source control.

### 2. Add a space

```bash
capacities auth add personal
# Opens $VISUAL / $EDITOR with a config template
# Paste your API token, save, and quit
# Token: Capacities → Settings → Capacities API → New Token
```

The CLI verifies the token is live before saving. Secrets are encrypted and stored at `~/.config/capacities/spaces/personal.age`. The `.age` file is safe to commit to a dotfiles repo; the key file is not.

### 3. Start using it

```bash
capacities search "project"
capacities get <objectId>
```

## Commands

```bash
# Auth / space management
capacities auth add <name>       # add a space (editor-based, token never echoed)
capacities auth edit <name>      # rotate or change credentials for a space
capacities auth use <name>       # set the default active space
capacities auth list             # list configured spaces (* = active)
capacities auth remove <name>    # remove a space, its secrets, and its cache
capacities auth keygen           # generate age keypair → ~/.age/key.txt

# Content
capacities search <query> [--type <type>]         # search objects (cached 10 min)
capacities get <objectId>                         # get object as markdown (cached 1h)
capacities link <objectId> <propertyKey> <targetId...>  # set entity field (one call, N targets)
capacities create --type <type> --title <title> [--desc <desc>] [--tags <tags>]
capacities update <objectId> <propertyKey> <value>
```

### Global flags

```
-s, --space <name>   override active space for this call
--json               output raw JSON (pipe to jq)
-q, --quiet          suppress output; use exit code only
--no-color           disable ANSI colours (or set NO_COLOR)
--debug              verbose logging for this invocation
```

## Caching

Every read is cached locally to avoid redundant API calls:

| Command | Cache TTL | Cache key |
|---|---|---|
| `search` | 10 minutes | query + type |
| `get` | 1 hour | object ID |
| structure list (internal) | 24 hours | per space |

Cache is stored under `~/.cache/capacities/<space>/`. After mutations (`link`, `create`, `update`) the affected object's cache entry is busted automatically.

To clear everything for a space: `capacities auth remove <name>` followed by `capacities auth add <name>`.

## Write-Through Mirror

After every mutation the CLI fetches the updated object and writes it locally:

```
~/.local/share/capacities/<space>/objects/<type>/<title>.md
```

The format matches Capacities' markdown export, so the directory works as a plain-text mirror of your mutated objects. Point `CAPACITIES_OBJECTS_DIR` at a git-tracked folder to keep a version-controlled log of changes.

## Multiple Spaces

```bash
capacities auth add personal
capacities auth add work

capacities auth use personal          # set default
capacities search "meeting notes"     # uses personal
capacities search "sprint" --space work  # override for one call
CAPACITIES_SPACE=work capacities get <objectId>  # via env var
```

## CI / Automation

For environments where the age key file is unavailable, pass the token directly:

```bash
CAPACITIES_TOKEN=cap-api-... capacities search "release"
```

For CI with age available, inject the private key inline:

```bash
CAPACITIES_AGE_KEY="$(cat ~/.age/key.txt)" capacities get <objectId>
```

## Configuration

Config file: `~/.config/capacities/config.toml` (XDG paths; Linux defaults apply on macOS)

```toml
active_space = "personal"

[spaces.personal]
objects_dir = "~/.local/share/capacities/personal/objects"
```

No secrets in `config.toml` — safe to commit to a dotfiles repo.

## Environment Variables

| Variable | Purpose |
|---|---|
| `CAPACITIES_CONFIG` | override config file path |
| `CAPACITIES_SPACE` | override active space |
| `CAPACITIES_TOKEN` | plaintext API token (for CI without age) |
| `CAPACITIES_AGE_KEY_FILE` | path to age private key (default: `~/.age/key.txt`) |
| `CAPACITIES_AGE_KEY` | inline age private key (for CI secrets injection) |
| `CAPACITIES_OBJECTS_DIR` | override write-through mirror directory |
| `CAPACITIES_CACHE_DIR` | override cache root |
| `CAPACITIES_LOG_LEVEL` | `debug\|info\|warn\|error\|silent` (default: `warn`) |
| `NO_COLOR` | disable ANSI colours |

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Unexpected error |
| 2 | Config / auth error |
| 3 | API error |
| 4 | Not found |
| 5 | Rate limit exceeded |

## Development

```bash
npm install
npm run dev -- search "test"    # run via tsx without building
npm run build                   # compile → dist/index.js
npm test                        # unit + integration tests
npm run coverage                # coverage report
```

### Testing approach

- **Unit** (`vitest` + `vi.mock`): command logic, cache TTL expiry, error code mapping
- **Integration** (`msw` v2 + `openapi-backend`): full command → SDK → HTTP, requests validated against the committed `openapi.json` spec

```bash
npx vitest run tests/integration
```

## Tech Stack

| | |
|---|---|
| Language | TypeScript |
| SDK | `@capacities/api` (official Capacities SDK) |
| CLI framework | Commander.js |
| Config | TOML via `smol-toml` |
| Secrets | `age-encryption` (FiloSottile's JS port) |
| Build | `tsup` |
| Tests | `vitest`, `msw` v2, `openapi-backend` |
