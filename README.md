# SpainDaily

SpainDaily is a mobile-first, offline-first daily travel assistant. The website is a public application shell; real itineraries are imported as separate password-encrypted packages and stay in the browser's IndexedDB.

The included demo is deliberately fictional. This repository and its build contain no real traveler names, bookings, tickets, QR codes, hotel addresses, notes, or source documents.

## What it does

- Requires an explicit traveler choice on every cold start while keeping normal in-app navigation uninterrupted.
- Opens the current local date, supports future preview and a one-tap return to today.
- Separates document facts, official checks, suggestions, conflicts, inferences, and pending items.
- Shows per-person transport and ticket attachments without mixing another person's orders.
- Saves task completion, ignored items, custom tasks, event status, personal notes, and time overrides by stable traveler ID.
- Uses Google Maps URLs without a paid map SDK.
- Works offline after the shell and imported attachments are saved locally.
- Imports, verifies, backs up, and restores AES-256-GCM encrypted trip packages.

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

`tools/extract_documents.py` extracts OOXML relationships, tables, links, images, and PDF text into a caller-selected private directory. `tools/package_trip.py` validates attachment hashes and creates a password-encrypted `.spaintrip` file. Passwords are read from an environment variable and are not accepted as command-line arguments.

See [the user guide](docs/USER_GUIDE.md), [architecture](docs/ARCHITECTURE.md), [privacy model](docs/PRIVACY.md), and [test report](docs/TEST_REPORT.md).
