# Chrome Bookmark Organizer

## Goal

Build a Chrome extension that cleans up messy bookmarks with a free-first approach, while keeping remote AI API support as an optional enhancement.

## Product Direction

Default behavior should work without any paid API:

1. Scan the Chrome bookmarks tree.
2. Detect duplicates and near-duplicates.
3. Group by domain, path pattern, and title keywords.
4. Run local semantic clustering when available.
5. Show a preview before applying changes.
6. Support undo or restore from a snapshot.

Remote AI should be optional and disabled by default.

## Architecture

### 1. Bookmark Ingestion

- Read bookmarks from the Chrome Bookmarks API.
- Convert the tree into a flat working list with:
  - id
  - title
  - url
  - parent folder
  - date added
  - domain
  - path

### 2. Free-First Classification Layer

This layer solves most of the problem without any cloud cost.

- Exact duplicate detection:
  - same URL
  - normalized URL match
- Rule grouping:
  - same domain
  - same path prefix
  - title keyword buckets
- Heuristic scoring:
  - likely article
  - likely tool
  - likely video
  - likely docs/reference
  - likely shopping/product

### 3. Local Semantic Layer

Optional local AI processing in the browser:

- Create embeddings from bookmark titles and lightweight URL/domain signals.
- Cluster similar bookmarks into suggested folders.
- Generate confidence scores for each suggestion.

This layer should still be free to run, but may require more device resources.

### 4. Remote AI Provider Layer

Remote AI is only used when the user enables it.

- Provider interface:
  - `classify(items)`
  - `cluster(items)`
  - `suggestFolderNames(groups)`
- Initial provider plan:
  - `local` provider
  - `gemini` provider
  - `openai-compatible` provider

Recommended policy:

- Use local results first.
- Call remote AI only for low-confidence groups or folder naming refinement.
- Never require a remote API key for core features.

### 5. Safety Layer

- Dry-run preview before any change.
- Snapshot current bookmark structure before apply.
- One-click rollback for the last operation.
- Clear log of moved, merged, or skipped items.

## Suggested User Flow

1. Click "Scan bookmarks".
2. Review duplicate results.
3. Review suggested categories.
4. Optionally enable AI refinement.
5. Preview folder moves.
6. Apply changes.
7. Undo if needed.

## MVP Scope

- Bookmark scan
- Duplicate detection
- Domain and keyword grouping
- Suggested target folders
- Preview changes
- Apply changes
- Undo from snapshot

## Phase 2

- Local semantic clustering
- Remote AI provider settings
- Low-confidence escalation to API
- Dead link detection
- "Unread later" and "archive" suggestions

## Configuration Principles

- Remote AI disabled by default
- API keys stored only in extension settings
- Minimal data sent to remote providers
- User can choose which providers are allowed
- User can limit remote AI to titles only

## Notes

The extension should be useful even if the user never enables any API key.

## Current Scaffold

The project now includes a loadable Chrome Extension skeleton:

- `manifest.json`: Manifest V3 entry
- `background.js`: message router and scan/apply/undo workflow
- `popup.html` + `js/popup.js`: scan preview panel
- `options.html` + `js/options.js`: AI provider settings
- `js/modules/bookmark-analysis.js`: local duplicate detection and grouping rules
- `js/modules/bookmark-actions.js`: apply plan and undo snapshot
- `js/modules/ai-providers.js`: optional Gemini and OpenAI-compatible naming refinement

## How To Load

1. Open Chrome and go to `chrome://extensions/`
2. Enable Developer Mode
3. Click "Load unpacked"
4. Select this folder: `chrome-bookmark-organizer`

## Current Behavior

- Scans bookmarks locally
- Detects exact duplicates after URL normalization
- Suggests folders using category rules and domain grouping
- Applies suggestions into a `Bookmark Organizer` root folder
- Saves the last apply snapshot for undo
- Supports optional remote AI naming refinement in settings

## Next Build Targets

- Add local semantic embeddings and clustering
- Add duplicate review actions
- Add dead-link check
- Improve apply preview with item-level diff
