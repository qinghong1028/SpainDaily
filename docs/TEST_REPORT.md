# Verification report

Last run: 2026-09-15.

## Actually tested

- TypeScript production build and GitHub Pages base-path asset resolution.
- Unit tests for IANA local-date calculation, date clamping/ranges, schema validation, schema-version rejection/migration entry point, IndexedDB persistence, traveler-isolated completion state, encrypted backup round-trip, and wrong-password rejection.
- Production-browser tests in Google Chrome for cold start, explicit traveler selection, last-choice behavior, four-tab navigation, source details, traveler-isolated tasks, and hidden development date controls.
- Private-package validation with 56 original attachments: encrypt, decrypt, payload hash, every attachment hash, schema/reference integrity, import into IndexedDB, per-person schedule, original ticket opening, cold-start traveler gate, and offline reload.
- Mobile viewport visual review at 390 × 844 CSS pixels for welcome, traveler selection, today, guides, and full-screen original-ticket views.
- Private path ignore rules and a tracked/build-output privacy scan.

## Deliberately not claimed as tested

- Physical iPhone or Android installation, storage eviction behavior, biometric/device-lock behavior, and OS-specific keyboard quirks.
- Supplier acceptance of an offline screenshot or static QR code.
- Live travel-day flight status, weather, traffic, public-transport disruption, venue closure, or ticket validity.
- Background push notifications; page countdowns are not presented as system alarms.
- Cross-device sync or per-person authorization; neither is part of this local-first release.
