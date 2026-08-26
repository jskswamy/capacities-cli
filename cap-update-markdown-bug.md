# Bug: `cap update --markdown` reports success but does not persist

## Summary

`cap update <id> --markdown` exits 0 and prints a success message but leaves the object body unchanged. Scalar property updates (`cap update <id> <property> <value>`) work correctly.

## Reproduction

```bash
# Works — persists
cap update 2c76fdbf-6820-4a77-ab6c-d7fcb505186c description "new value"
cap get 2c76fdbf-6820-4a77-ab6c-d7fcb505186c | grep description  # shows new value ✅

# Broken — does not persist
cap update 2c76fdbf-6820-4a77-ab6c-d7fcb505186c --markdown /path/to/file.md
# prints: Updated markdown on 2c76fdbf-...
cap get 2c76fdbf-6820-4a77-ab6c-d7fcb505186c  # body unchanged ❌

# Also broken — stdin variant
cat file.md | cap update 2c76fdbf-6820-4a77-ab6c-d7fcb505186c --markdown -
# prints: Updated markdown on 2c76fdbf-...
cap get 2c76fdbf-6820-4a77-ab6c-d7fcb505186c  # body unchanged ❌
```

## Object used for testing

- ID: `2c76fdbf-6820-4a77-ab6c-d7fcb505186c`
- Type: Blip (structureId `bc0b170d-c1a1-46ac-bd8e-95cff1da3009`)
- Title: Tailscale

## What was attempted

Appending a section to an existing Blip body. The file passed to `--markdown` was the full frontmatter + body (from `cap get`) with a new section appended — not just a diff.

## Debug trace (third attempt, after second fix)

```
[capacities:debug] patchMarkdown → PATCH /object/markdown id=2c76fdbf-... bytes=2851
[capacities:debug] patchMarkdown ← 200 body={"id":"...","structureId":"bc0b170d-...","collections":[],"properties":{"title":...
[capacities:debug] cache busted object/2c76fdbf-....json
[capacities:debug] wrote objectsDir /Users/subramk/LifeOS/capacities/'blip's/Tailscale.md
Updated properties on 2c76fdbf-...
```

`cap get` after update:

```
[capacities:debug] cache miss object/2c76fdbf-....json
```

→ hits API fresh (not local cache). Still returns unchanged body.

## What we know

- The request is sent: `PATCH /object/markdown`, 2851 bytes, HTTP 200
- `cap get` bypasses cache (cache miss → fresh API call) and still returns the old body
- The local objectsDir file is also unchanged — the CLI writes from the API response, which only contains `properties`, no markdown body
- **The Capacities API is accepting the PATCH and returning 200, but not persisting the markdown body**

## Hypothesis

The `PATCH /object/markdown` endpoint accepts the request but silently ignores the body content. Possible causes:

- Wrong request body format — the markdown may need to be wrapped in a specific JSON field (e.g. `{ "markdown": "..." }`) rather than sent as raw text
- Wrong `Content-Type` header — API expects `application/json` but CLI may be sending `text/plain` or `multipart/form-data`
- The endpoint may only accept structured property patches, not free-form markdown body updates

Check the exact outgoing request body and `Content-Type` header — the 200 response with properties-only body suggests the server processed a valid request but there was nothing in it that maps to body/markdown content.
