MIAAD 1.2 — incremental lesson management upgrade

The existing Android Activity/WebView shell, emerald identity, local-first snapshot bridge, anonymous Firebase authentication, and recurring schedules remain in place. The report, student directory and Today renderers now use one shared domain model.

Changed responsibilities:

- `app-domain.js`: normalized maps for students, occurrence records, effective-dated schedules, cycles, reporting periods and notifications; derived totals, date-range calculations, availability, migration and activity history.
- `app-integration.js`, `app-core.js`, `app-events.js`: schema-4 snapshot persistence and backward-compatible attendance/notes maps, explicit backup merge, future schedule changes.
- `app-features.js`, `app-boot.js`: editable student profiles, quick status recording with optional notes, historical entry, period/cycle controls, date/status/note filters, grouped settings, actionable notification center and native alarm plan.
- `app-reports.js`, `css-features.css`: language-neutral report data with Arabic RTL / English LTR presentation, full notes, teacher comments, archive, CSV and print/PDF layout.
- `ReminderScheduler`, `RestoreRemindersReceiver`, `ReminderReceiver`: persistent Android alarms, delivery deduplication, snoozing, boot restore and entity links. Alarm timing follows Android's inexact background scheduling.
- `MiaadBridge`, `MainActivity`: real Android print-to-PDF/print service, native snapshot retention, existing Firebase payload compatibility and atomic sharding for large snapshots. WebView debugging is enabled only in debuggable builds for installed-APK acceptance tests.

Data compatibility:

- Schema 4 adds `domain` to the existing snapshot; old lesson/status/note/audit fields are retained and remain exportable.
- Legacy student identities are deterministic; a legacy occurrence keeps its `YYYY-MM-DD__scheduleId` identity, preventing repeat migration from duplicating attendance.
- Existing recorded occurrences receive a schedule snapshot from the available legacy schedule. Historical timestamps already overwritten by an older application cannot be reconstructed; this upgrade preserves the data available at migration and prevents subsequent recurrence edits from rewriting it.
- Schedule revisions apply from today or later. A started occurrence is frozen before changing its recurrence. Deleted schedules retain historical revisions; deleting a single occurrence creates a tombstone.
- Reports freeze the period's schedule data and counting rules when archived. Explicit attendance edits or historical entries intentionally refresh affected archived records and derived totals; changes to future schedules do not.
- Counted totals are derived. Pending/future rows never imply attendance or absence. Target and period renewal are opt-in.
- The transport keeps the legacy Firestore payload for snapshots below 700 KB. Larger snapshots are written in an atomic batch of versioned chunks beneath the existing owner-protected state path. Local saving continues if cloud sync is unavailable.

Checks:

1. `node scripts/test-domain.cjs` exercises cycle completion/reversal/deduplication, inclusive custom periods, overlapping-period rejection, archive retention, old-data migration and reload, schedule changes/deletion, actual minutes, historical import, duplicate manual entry rejection, blocked time, buffers, minimum slots, cross-midnight working ranges and pending reminders.
2. `node scripts/test-schedule.cjs` retains the original seed/Idris/unknown-time/max-duration/midnight regressions.
3. `node scripts/test-browser.cjs` uses Playwright with installed Edge (or adjust the channel locally). Set `PLAYWRIGHT_PATH` when Playwright is installed outside the usual Node module lookup. It exercises the real UI at 390×844 and 1440×1000, past entry, reload, report language invariance, screenshots and print PDFs. Test data lives only in isolated browser contexts.
4. `python3 scripts/audit_brand.py` checks all images and JavaScript; APK mode decodes the compiled manifest, compares all web assets and approved logo pixels, checks ZIP/PNG integrity and Firebase resources.
5. Cloud Gradle builds the actual APK. The Android 12 offline test installs it, records startup and checks crash/JS logs. `scripts/emulator_acceptance.py` connects to the debug WebView on the isolated emulator, tests cycles/reversal/archive/language, writes through the real Android bridge, restarts the process and verifies retained data and system alarm registration.

Operational limits: Firebase live synchronization with a user's account is not part of the offline emulator test. Existing anonymous-auth and latest-snapshot conflict behavior are retained. The workflow builds a debug-signed APK; a phone can update an installed version in place only when signing certificates match. Export the existing application's JSON backup before any installation that would require removing it; uninstalling removes its local data and anonymous identity. Production distribution should use a retained signing key.

Android implementation references: [HTML printing](https://developer.android.com/training/printing/html-docs) and [scheduled alarms and reboot restoration](https://developer.android.com/develop/background-work/services/alarms).
