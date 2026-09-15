# Verification report

Last run: 2026-09-15.

## Actually tested

- TypeScript production build and GitHub Pages base-path asset resolution.
- 24 unit tests for IANA local-date calculation, date clamping/ranges, schema validation, schema-version rejection/migration entry point, task-change detection, special-character Google Maps URLs, current/previous route separation, encrypted IndexedDB vault persistence, state preservation across content updates, traveler-isolated completion state, local-state/package encryption round-trips, missing-attachment refusal, and wrong-password/corruption rejection.
- 8 production-browser tests in Google Chrome for cold start, explicit traveler selection, travel-day labeling, last-choice behavior, four-tab navigation, source details, traveler-isolated tasks, full-calendar selection, location actions, guide search, and hidden development date controls.
- 2 private-package browser workflows with 70 attachments (56 original media plus 14 full-page PDF renders): encrypt, decrypt, payload hash, every attachment hash, schema/reference integrity, import into the encrypted vault, per-person schedule, original ticket opening, original-page opening, reload password gate, cold-start traveler gate, explicit lock, offline password unlock, full encrypted-backup download, local deletion, backup restore, note recovery, and restored original-ticket opening.
- Mobile viewport visual review at 390 × 844 CSS pixels for welcome, traveler selection, today, calendar, location actions, guide search, and full-screen original-ticket views.
- Private path ignore rules and a tracked/build-output privacy scan.

## Deliberately not claimed as tested

- Physical iPhone or Android installation, storage eviction behavior, biometric/device-lock behavior, and OS-specific keyboard quirks.
- Supplier acceptance of an offline screenshot or static QR code.
- Live travel-day flight status, weather, traffic, public-transport disruption, venue closure, or ticket validity.
- Background push notifications; page countdowns are not presented as system alarms.
- Cross-device sync or per-person authorization; neither is part of this local-first release.
