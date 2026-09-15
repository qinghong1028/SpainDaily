# Architecture

## Public shell / private data boundary

The Vite/React bundle contains only UI, schema, migrations, encrypted-package support, storage code, tests, and fictional demo data. A real trip is never imported at build time.

The browser import flow is:

1. Parse the package envelope and reject unsupported versions or algorithms.
2. Derive an AES-256 key from the user password with PBKDF2-HMAC-SHA256.
3. Authenticate and decrypt the AES-GCM payload in memory.
4. Verify the ZIP payload hash, validate the data schema, run migrations, and verify every attachment hash.
5. Encrypt personal state with a fresh salt and the same user-entered password, then replace the active IndexedDB vault record in one transaction.

Passwords and derived keys are not persisted. The original encrypted package and encrypted personal state remain in IndexedDB; decrypted data and attachments remain in module memory until reload or explicit lock. Unlocking revalidates the package, decrypts personal state, then opens the traveler gate. The browser's local store is not presented as absolute security against a compromised device.

## Data model

`Trip`, `Traveler`, `DayPlan`, `Event`, `Booking`, `Place`, `Attachment`, `DailyTask`, `GuideArticle`, and `Source` live in the immutable imported data layer. `TaskState`, event state, note state, reference timezone, and other user choices remain logically separate and are encrypted into the local state blob. A normal content-package update preserves them; an explicit backup restore replaces them.

All relationships use stable IDs. Import validation checks global ID uniqueness and every traveler/day/event/booking/place/attachment/task/source reference.

## Dates and time zones

Events carry an IANA timezone. Flight package records store departure and arrival locations, local times, local dates, and timezones separately. “Today” uses one explicit reference timezone selected by the user; pre-trip the device timezone is the default. UTC string slicing is not used for local-day decisions.

## Offline and updates

The service worker caches the public shell and same-origin runtime resources. Encrypted trip content and encrypted personal state live in IndexedDB, so a shell update does not clear them. After offline reload, the user still enters the package password; decryption and attachment access work without a network. The readiness check compares the in-session decrypted attachment IDs with the signed manifest before claiming completeness.

## Package format

The binary envelope starts with `SPAINDAILY1\n`, followed by a big-endian JSON-header length, the authenticated JSON header, and AES-GCM ciphertext. The header contains format/schema versions, KDF parameters, random salt, random IV, payload hash, creation time, and package kind. The authenticated ZIP contains `trip.json`, attachments, and optional backup state. Backup creation fails if any manifest attachment is missing or has a size/hash mismatch.
