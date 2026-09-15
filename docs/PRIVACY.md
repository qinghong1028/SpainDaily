# Privacy and security model

## Never public

Real source documents, extracted media, traveler data, bookings, tickets, QR codes, accommodation details, private reports, decrypted trip JSON, local screenshots, and generated `.spaintrip` files belong only in ignored private paths. They must not enter Git history, GitHub Pages artifacts, CI logs, or public downloads.

The deployment workflow builds from tracked source and uploads only `dist/`. A repository privacy check scans tracked text and the build for private-path leakage, identity-document patterns, and locally supplied private markers.

## Encryption

Trip packages use AES-256-GCM. Keys are derived with PBKDF2-HMAC-SHA256 using 310,000 iterations and a random 128-bit salt; every package uses a random 96-bit IV. The encrypted payload has an authenticated header, a SHA-256 payload digest, and per-attachment SHA-256 digests.

The password is not stored or uploaded. A forgotten password cannot be recovered by the public app. IndexedDB stores only the original encrypted package and a separately AES-256-GCM-encrypted personal-state blob. Decrypted trip data, attachments, tasks, notes, settings, and the non-exportable derived state key live only in the current JavaScript session and are cleared by “Lock private data” or a reload.

The database upgrade from the earlier development schema deletes its old plaintext object stores. Users of that pre-release schema must reimport the encrypted package. Encryption at rest does not protect an already unlocked page, a compromised browser/OS, screenshots, clipboard content, or data deliberately opened in an external service; device security still matters.

## External services

There is no analytics, tracking, backend, paid map SDK, or automatic AI/OCR upload. Clicking a Google Maps or official-source link leaves the app and is subject to that service's privacy and connectivity. Private identifiers are never appended to those URLs.

## Identity boundary

Traveler selection is a local view switch, not authentication or authorization. Anyone using the current unlocked session can switch to another traveler in the imported package. After reload or explicit lock, the package password is required before the traveler gate appears. True per-person access control would require a separately reviewed authentication and synchronization design.
