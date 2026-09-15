# SpainDaily

SpainDaily is a mobile-first, offline-first daily travel assistant. The website is a public application shell; real itineraries are imported as separate password-encrypted packages. IndexedDB retains only the encrypted package and encrypted personal state; decrypted content exists only in the current unlocked session.

The included demo is deliberately fictional. This repository and its build contain no real traveler names, bookings, tickets, QR codes, hotel addresses, notes, or source documents.

## What it does

- Requires an explicit traveler choice on every cold start while keeping normal in-app navigation uninterrupted.
- Opens the current local date, refreshes after resume or midnight, and supports a complete calendar, future preview, countdowns, and a one-tap return to today.
- Puts the day's short action list first, then shows the next event, route/rest/lighter alternatives, and the full timeline.
- Separates document facts, official checks, suggestions, conflicts, inferences, and pending items.
- Shows per-person transport and ticket attachments without mixing another person's orders.
- Saves task completion, ignored items, custom tasks, event completion/skip/not-applicable state, personal notes, and time overrides by stable traveler ID.
- Provides Google Maps place, current-location, previous-stop, address-copy, weather-query, and clearly labeled nearby-search actions without a paid map SDK.
- Searches guides and opens encrypted full-page source renders for complex original tables.
- Works offline after the shell and imported attachments are saved locally.
- Imports, verifies, locks, backs up, and restores AES-256-GCM encrypted trip packages.

## Local development

```bash
pnpm install
pnpm dev
```

Production verification:

```bash
pnpm test
pnpm build
pnpm test:e2e
pnpm privacy:check
```

The PWA is built under `/SpainDaily/` for GitHub Pages. Only `dist/` is uploaded by the deployment workflow.

## Private package tooling

`tools/extract_documents.py` extracts OOXML relationships, tables, links, images, and PDF text into a caller-selected private directory. `tools/package_trip.py` validates attachment hashes and creates a password-encrypted `.spaintrip` file. Passwords are read from a named environment variable for automation or prompted without echo in an interactive terminal; they are never accepted as command-line arguments.

See [the user guide](docs/USER_GUIDE.md), [architecture](docs/ARCHITECTURE.md), [privacy model](docs/PRIVACY.md), and [test report](docs/TEST_REPORT.md).
