# Privacy and security model

## Never public

Real source documents, extracted media, traveler data, bookings, tickets, QR codes, accommodation details, private reports, decrypted trip JSON, local screenshots, and generated `.spaintrip` files belong only in ignored private paths. They must not enter Git history, GitHub Pages artifacts, CI logs, or public downloads.

The deployment workflow builds from tracked source and uploads only `dist/`. A repository privacy check scans tracked text and the build for private-path leakage, identity-document patterns, and locally supplied private markers.

## Encryption

Trip packages use AES-256-GCM. Keys are derived with PBKDF2-HMAC-SHA256 using 310,000 iterations and a random 128-bit salt; every package uses a random 96-bit IV. The encrypted payload has an authenticated header, a SHA-256 payload digest, and per-attachment SHA-256 digests.

The password is not stored or uploaded. A forgotten password cannot be recovered by the public app. Encrypted-at-rest browser storage is not promised: after import, IndexedDB contains locally readable data for offline use. Device access, browser profiles, backups, and OS security still matter.

## External services

There is no analytics, tracking, backend, paid map SDK, or automatic AI/OCR upload. Clicking a Google Maps or official-source link leaves the app and is subject to that service's privacy and connectivity. Private identifiers are never appended to those URLs.

## Identity boundary

Traveler selection is a local view switch, not authentication or authorization. Anyone who can open an unlocked browser profile can switch to another traveler in the imported package. True per-person access control would require a separately reviewed authentication and synchronization design.
