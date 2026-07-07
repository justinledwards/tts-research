# UI / screenshot verdict

The current UI direction is **usable as a foundation**, but it is **not yet sufficient for the agreed best-in-class read-along product**.

The committed screenshot set is broad: `reviewer-screenshot-manifest.md` lists Book/Document/Website Cinema, EPUB/PDF/DOCX variants, failure paths, focus modes, More menus, responsive phone/tablet/narrow-desktop/desktop captures, workspace states, settings, and teleprompt/theatre surfaces. The strongest existing direction is the shared Cinema model: `Read`, `Inspect`, `Review`, `Theatre`, `More`, a bottom transport, source/provenance panels, low-confidence badges, and mobile bottom sheets. That is directionally compatible with serious read-along.

The main issue is that the screenshots still show a **completed-job / source-ready UI**, not the agreed **source/manifest/revision-aware ASAP UI**. The current UI can say “Audio ready,” “Low confidence,” “Source ready,” “Audio missing,” or “Needs rebuild,” but it does not yet show the product-critical distinctions: partially readable, partially narratable, first segment unchecked, checked, stale, replaced, segment failed, manifest superseded, repair overlay applied, resume remapped, or temporary source promoted into a durable project.

## Top UI blockers

**1. State vocabulary is too coarse.**
Screenshots like `book-cinema-epub-long-focus-read.png`, `book-cinema-pdf-focus-read.png`, and `responsive-book-phone.png` show `Audio ready` and `Low confidence`, but not the agreed per-segment/read-along states: unchecked audio, checked audio, stale audio, replaced audio, failed segment, phrase/block/source-only fallback, or remap confidence.

**2. Read mode is calm only for already-ready examples.**
`desktop-1440-website-cinema-calm-read.png` and `phone-390-website-cinema-calm-read.png` are encouraging: the canvas dominates and controls are reachable. But there are no committed screenshots proving the harder states: extraction still running, first readable prefix available, first audio segment unchecked, later segment failure, or durable resume after reload.

**3. Workspace and status surfaces are still too operational for the first reading job.**
`workspace-full.png`, `workspace-balanced.png`, and `desktop-1920-taskbar-workspace.png` show dense rails, inspector cards, blocked stage cards, and a bottom status strip. That may be acceptable for operator/review work, but the serious reading path should not require users to understand the whole Voice Studio workflow before reading.

**4. Pre-audio and degraded transport states are inconsistent.**
`book-cinema-no-audio.png` is cleaner: one primary “Create audio” action. But `book-cinema-docx-failure.png` shows pre-audio/health/footer controls in a crowded, overlapping way. The shared transport state mapper needs to become strict before unchecked/stale/replaced segment states are added.

**5. Key evidence is missing.**
There is no committed screenshot evidence for Quick Listen paste → temporary reader → promote to durable project; no screenshot for repair overlay fork/supersede; no screenshot for source/manifest partial extraction; no image/OCR batch surface; and no committed `Design for the Real World` durable project reading screenshot. The UI may have code paths, but the evidence set does not prove the agreed product.

# Screen-size review

## Phone 390

The phone screenshots prove the product can become readable on a small screen. `phone-390-website-cinema-calm-read.png` has large text, reachable Play/Speed/Bookmark controls, and a canvas-first reading posture. `responsive-book-phone.png`, `responsive-book-phone-sheet.png`, and `responsive-book-phone-theatre.png` show the mobile reader, bottom sheet, and theatre variants working without obvious horizontal overflow.

What must be true:

* **Source reading:** phone should open directly into source-first reading when possible. The user should not have to reason through the dense workspace state shown in `phone-390-workspace.png` to start reading.
* **Controls:** bottom transport must remain reachable with one hand. Play/pause, seek, speed, bookmark, and More must remain at least 44px targets. The bottom sheet must never cover the active transport.
* **Progress/resume:** phone needs a compact resume state: “Resumed exactly,” “Resumed to block,” or “Resume location changed.” The current phone screenshots show time and bookmark but not durable resume confidence.
* **Degradation states:** low-confidence and sync fallback must be visible without taking over the screen. A one-line footer/banner is enough; a full diagnostics panel is not.

Phone first-batch bar: **source text visible fast, primary transport reachable, no hidden recovery state, no required debug rail.**

## Constrained desktop 1100

`constrained-1100-website-cinema-calm-read.png` shows a workable layout: the header wraps into a two-row mode/control area, the reading canvas remains dominant, and footer controls fit. This viewport is important because it exposes whether the UI depends on desktop width.

What must be true:

* **Source reading:** no side rail should be required. Read mode must stay canvas-first, with Inspect/Review available but not persistent.
* **Controls:** footer controls can remain full-width, but waveform/progress must not collapse into unreadable fragments. If space is tight, waveform detail should yield before Play/Seek/Speed/Bookmark.
* **Progress/resume:** source state and resume quality should appear near the source title or footer, not in a side panel that is absent at this width.
* **Degradation states:** `Low confidence`, `Unchecked`, `Stale`, and `Replaced` must survive the constrained layout as concise chips plus a plain-language reason.

Constrained desktop first-batch bar: **no rail dependency, no mode/control collision, manifest state visible in the header/footer.**

## Desktop 1440

`desktop-1440-website-cinema-calm-read.png` is the clearest proof that the current direction can support a serious reading canvas. The page is calm, the reading measure is comfortable, and diagnostics are hidden. `website-cinema-focus-inspect.png` and `book-cinema-epub-long-focus-review.png` show the right context dock working when the user intentionally switches modes.

What must be true:

* **Source reading:** Read mode should continue to suppress the context dock unless pinned. The reader canvas must not become a dashboard.
* **Controls:** the footer can expose the full transport. It should include sync fidelity and segment state without turning into a chip strip.
* **Progress/resume:** desktop should show a stronger “current place” model: chapter/section/block, current segment, and resume state. This should be manifest-derived, not job-derived.
* **Degradation states:** exact word / phrase / block / audio-only / source-only must be visually distinct. The current orange word/phrase highlights are not enough for low-confidence PDFs and OCR-like material.

Desktop first-batch bar: **canvas-first read, optional context, explicit fidelity state, no hidden stale artifact.**

## Large desktop / taskbar 1920

`desktop-1920-taskbar-workspace.png` proves the app can expose more context, but it also shows the risk: large screens invite dense rails, inspectors, broad status strips, and multiple competing controls. For a reading aid, more pixels should improve orientation, not add operator burden.

What must be true:

* **Source reading:** long lines must remain capped. Use extra width for optional TOC/provenance/review panels only when pinned or mode-selected.
* **Controls:** the bottom status strip should not duplicate header/mode state. It should remain the authoritative operational status area, but not become a second dashboard.
* **Progress/resume:** large desktop can show richer progress: section queue, segment readiness, resume quality, and artifact status. This belongs in Review/Inspect, not Read by default.
* **Degradation states:** the app can show more explanation on large screens, but the primary read state should still be a concise chip/banner with details one click away.

Large desktop first-batch bar: **wide screen adds optional context, not default complexity.**

# Source-surface review

## Quick Listen / pasted text

Current evidence is incomplete. The workspace header exposes a `Quick Listen` entry, and `QuickListenPanel.tsx` has a real temporary-source model for paste, URL, file, and recent sources. But the committed screenshots do not prove the full Quick Listen read path.

The first-batch UI must show:

* paste or URL captured as a temporary source;
* source becomes readable before audio is complete;
* first unchecked audio segment becomes playable;
* stale/failed/replaced segment state;
* “Keep in project” promotion preserving source, audio, progress, bookmarks, and repair history;
* promoted project source opens with a durable project identity.

Also, the current Quick Listen file support is intentionally text-ish: TXT, Markdown, HTML, CSV, JSON, LOG up to 2 MB. That is fine for first batch, but the UI must not imply PDF/DOCX/EPUB/OCR Quick Listen excellence until those adapters meet the same evidence gates.

## Website / HTML

Website Cinema is the strongest current surface. `website-cinema-focus-read.png`, `website-cinema-focus-inspect.png`, and the responsive website screenshots show a coherent path: clean reading canvas, article metadata, Inspect mode for provenance, Review mode for work state, and More for advanced tools.

Required upgrades:

* Add source phases: fetching persisted, extracting, partially readable, narratable, first audio unchecked, checked, stale.
* Replace generic `Audio ready` with manifest-derived audio/sync state.
* Keep source provenance in Inspect, not Read.
* Add a concise raw URL/content hash/provenance summary in Inspect.
* Add visible phrase/block/source-only fallback when source or timing confidence is insufficient.

Website/HTML is a good first proof surface alongside EPUB/structured HTML.

## EPUB / structured book

EPUB is the right first long-form proof path. The screenshots show chapter scope, page/spread rendering, long-chapter handling, low-confidence state, source/provenance panels, and phone/theatre variants. `book-cinema-epub-long-focus-read.png` and `book-cinema-epub-long-focus-read-pinned.png` show enough structure to validate section/page/window behavior.

Required upgrades:

* Treat chapter/page/spine structure as source units from a partial manifest.
* Do not require final page count before the first section is readable.
* Distinguish source/page progress from audio/segment progress.
* Show queued later sections without blocking the first readable/narratable section.
* Make low confidence specific: “word sync unavailable,” “phrase fallback,” “block-only,” “segment confidence below threshold,” etc.
* Add `Design for the Real World`-style durable project screenshots, not only Kappa fixture screenshots.

EPUB/structured HTML should be the first UI proof of the agreed architecture.

## PDF

PDF UI is directionally good for degradation because `book-cinema-pdf-focus-read.png` and `book-cinema-pdf-failure.png` expose `Low confidence` and reading-order warnings. That is the right posture: PDF should not be allowed to masquerade as exact word sync when extraction is uncertain.

Required upgrades before claiming best-in-class PDF:

* Use block/phrase visual treatment for low-confidence PDF, not word-like highlight styling that suggests exactness.
* Show extraction tier and reading-order confidence in Inspect/Debug, with a simple Read-mode reason.
* Make per-page failure/retry visible later.
* Do not include PDF in first proof path beyond preserving shared contracts and screenshots.

PDF remains the first messy-document follow-up, not the first UI target.

## DOCX

DOCX has source coverage in screenshots, but it exposes a shared-transport problem. `book-cinema-docx-focus-read.png` looks readable, but `book-cinema-docx-failure.png` shows pre-audio controls and footer elements colliding visually. That must be fixed before adding more artifact states.

Required upgrades:

* Make pre-audio a clean single-primary-action state everywhere.
* Keep DOCX-specific extraction/provenance in Inspect.
* Treat comments, tables, images, and notes as Review/Inspect concerns, not default narration surprises.
* Do not prioritize DOCX UI parity in the first batch beyond shared transport/state correctness.

## Image / OCR batches

No committed image/OCR batch UI evidence is visible in the screenshot set. OCR is implied by the adapter/source ambition, but not proven in the UI.

For first batch:

* Do not build the OCR workbench.
* Do define the UI states it will later use: page extracting, page readable, low OCR confidence, failed page, review required, narratable after confirmation, block/line-only sync.
* Do not show image/OCR as best-in-class in product copy.

OCR should be contract-ready, not UI-complete.

## Existing project / prepared source: `Design for the Real World` durable reading

The screenshots demonstrate durable-ish project and prepared-source surfaces using `Draft text`, `Citations`, and Kappa fixtures. They do not yet prove the target in-app project/source context: `Design for the Real World` inside TTS-Research.

For the agreed product, the first UI batch needs a durable project reading evidence lane:

* project source selected;
* source revision/manifest identity visible in Inspect;
* reader opens directly from project source;
* progress resumes after reload;
* partial/unchecked/stale state remains durable;
* repair overlay state survives navigation;
* Quick Listen promotion lands into this same durable source model.

The serious reading product should feel like opening a durable source, not like operating a TTS production workflow.

# Mode and state review

## Read / Review / Inspect / Debug

The mode model is mostly right.

* **Read** should stay canvas-first. Current website calm-read screenshots prove the desired direction.
* **Inspect** should own provenance, source quality, manifest identity, locators, and current passage details.
* **Review** should own repair, skipped content, section queues, stale segments, and narratable-unit readiness.
* **Debug / Diagnostics** should remain operator-facing and hidden by default.

The risk is the mode strip becoming too prominent. In Read mode, `Theatre` and `More` are visible peer modes next to `Read`, `Inspect`, and `Review`. That may be acceptable on desktop, but phone and constrained widths should prioritize reading, source state, and transport.

## Failure states

Current failure evidence is too workbench-centric. `book-cinema-epub-failure.png` shows “Source needs metadata,” blocked stages, bottom status chips, Activity, and Open Intake. That is useful for operator recovery, but it does not prove read-along recovery.

Needed failure states:

* extraction failed but prefix remains readable;
* segment synthesis failed but earlier prefix remains playable;
* unchecked segment failed checking and was marked failed/stale;
* highlight map failed but audio remains playable with block/audio-only progress;
* repair created a superseding manifest and old audio became stale.

Failure UI must be scoped: source-level, unit-level, segment-level, alignment-level, or promotion-level.

## Partial / unchecked / stale states

This is the largest missing UI layer.

Required visible states:

* `Source readable` before audio exists;
* `Narration queued`;
* `First segment unchecked`;
* `Segment checked`;
* `Segment failed`;
* `Audio stale`;
* `Audio replaced`;
* `Highlight stale`;
* `Manifest superseded`;
* `Resume degraded`;
* `Repair remap pending`.

Current `Audio ready`, `Audio missing`, `Needs rebuild`, and `Low confidence` are not enough.

## Repair overlays

Repair overlay UI is not proven by screenshots. The workspace edit/review surfaces show sentence editing and validation transcript areas, but not immutable repair overlays with fork/supersede behavior.

First-batch UI needs only the minimal overlay experience:

* affected unit marked repaired;
* current manifest superseded or forked;
* affected audio/highlight artifacts stale;
* high-confidence resume remap auto-applied;
* low-confidence remap offers old vs repaired resume choice.

Do not build a full correction workbench yet.

## More menus / advanced diagnostics

`website-cinema-focus-read-more-menu.png` shows the More menu contains Display, Theatre, Policy internals, Source internals, Diagnostics, Timing map, Alignment repair, Command Palette, and Keyboard shortcuts. This is too tall and too close to the reading path.

Rules:

* More should expose user-facing Display, Source/Structure, Help, and maybe Advanced.
* Diagnostics, timing map, alignment repair, policy internals, and source internals should be behind Advanced/Debug unless there is an active failure requiring recovery.
* More must not overlap or obscure the footer controls on constrained screens.
* Required recovery actions cannot live only in More.

## Teleprompt / Theatre

Teleprompt Theatre has good responsive evidence, including phone, constrained desktop, 1440, and 1920 screenshots. Cinema Theatre phone screenshots are also readable.

But Teleprompt/Theatre should not get first-batch expansion. The read-along product wedge is durable source reading, not presenter mode. Keep these surfaces from regressing, share the sync renderer where possible, and defer new theatre work.

## Temporary source promotion

The copy and code model exist, but screenshot evidence is missing. This is first-batch relevant because Quick Listen must be promotable into durable project state without losing source, progress, artifacts, or repair history.

Needed UI:

* temporary boundary visible but not fear-inducing;
* “Keep in project” appears once there is useful work;
* default keep progress/bookmarks/generated artifacts/repair history;
* storage/provenance warnings where appropriate;
* promotion crosswalk result: user lands in durable project source;
* old temporary return path is clearly temporary until expiry.

# UI architecture implications

**Use one source reader shell.**
Book, Website, Document, PDF, DOCX, prepared source, and future OCR should adapt into the same source reader shell: header, source state, canvas, transport, context dock, mobile sheet, and More menu. Per-format components should render source units, not own lifecycle semantics.

**Make manifest state the UI input.**
The reader should consume a `ReadalongManifestView`, not infer state from `VoiceJob`. Header chips, footer controls, read-along fidelity, retry buttons, and stale banners should derive from manifest/unit/segment/artifact state.

**Separate the canvas from the inspector.**
Read mode renders source text and transport. Inspect renders provenance/source quality. Review renders repair/narratable queues. Debug renders timing/operator diagnostics. Do not let every mode mount every panel.

**Transport must be state-machine driven.**
Pre-audio, generating, partial unchecked, playable checked, stale, replaced, failed, and source-only states need one shared mapper across Book/Website/Document Cinema. Per-format components should not decide whether inert controls show.

**Sync fidelity must be a first-class visual primitive.**
Exact word, phrase, block, audio-only, and source-only require distinct styling and plain labels. Low confidence cannot reuse a visual that looks like exact word sync.

**Mobile uses sheet primitives, not hidden desktop rails.**
Below 1024px, persistent rails should be suppressed. Source/Structure/Narration can be in the shared bottom sheet, but required state must remain visible in the header/footer.

**Window the source canvas.**
The first EPUB/structured HTML proof path needs internal section/block windowing. Do not render whole long books or full token spans in the DOM by default.

**Keep diagnostics lazy.**
Timing maps, alignment repair, source internals, policy internals, command palette, and schema/debug panels should not be on the initial read path.

# First-batch UI scope

## Belongs in the first `<=20` issue batch

1. **Manifest-derived state vocabulary in UI:** readable, narratable, partial, unchecked, checked, stale, replaced, failed, superseded, degraded.
2. **EPUB/structured HTML partial-read UI:** stable prefix, pending later sections, narratable first unit, first playable segment.
3. **Shared transport state mapper:** fix pre-audio and add unchecked/checked/stale/replaced/failed states.
4. **Sync fidelity indicator and visuals:** word / phrase / block / audio-only / source-only, with no exact-word lie.
5. **Durable resume UI:** exact resume, degraded resume, remap pending, old vs repaired version choice when confidence is low.
6. **Minimal repair overlay state:** repaired unit, superseded manifest, affected audio/highlight stale.
7. **Quick Listen promotion UI:** keep progress/bookmarks/generated artifacts/repair history by default; land in durable project source.
8. **Read-mode failure/retry states:** extraction prefix failure, segment failure, alignment failure, checking failure, stale highlight.
9. **More menu simplification/gating:** keep diagnostics advanced, required recovery visible outside More.
10. **Phone/constrained screenshot evidence:** partial, unchecked, stale, failed, promoted, and resumed states at 390 and 1100.
11. **`Design for the Real World` durable project evidence:** committed screenshots showing the target in-app project/source context.
12. **Pre-audio/footer collision fix:** especially for DOCX/Book Cinema variants.

## Defer

* Full visual redesign.
* Full PDF UI parity.
* Full DOCX comments/tables/track-changes workflow.
* OCR/image batch workbench.
* Full repair editor.
* Non-contiguous playback UI.
* Advanced diagnostics dashboard.
* Command Palette expansion.
* Teleprompt/Theatre redesign.
* Browser extension.
* Cloud sync/account/collaboration UI.
* AI summaries, chat, quizzes, notes, or study features.
* Full import wizard redesign.
* New theme system work.
* Audiobook library/marketplace UI.
* Full Readium-style EPUB UI beyond local resume/locator needs.

# Pressure-test questions

1. Should the user-facing surface still be called **Cinema**, or should the first-batch reading path be renamed/framed as **Reader** while keeping Cinema/Theatre as optional display modes? This affects IA, screenshots, and whether the product feels like a serious reading aid or an internal studio mode.

2. On phone, should Quick Listen and durable project sources be allowed to **bypass the full workspace** and open directly into the source reader after intake? I recommend yes; the phone workspace is too dense for the ASAP read-along job.

3. Should first-batch UI evidence require `Design for the Real World` as the canonical durable project fixture, replacing Kappa-only proof for the agreed wedge? I recommend yes, while keeping Kappa fixtures for adapter/smoke coverage.

# Agreement candidate

Carry this into Linear issue-batch review: the UI direction should proceed, but narrowed to a **source-reader product spine**. Keep the shared Cinema shell concepts that work—calm Read mode, optional Inspect/Review/Debug, mobile bottom sheets, bottom transport, provenance panels—but make them manifest/revision-aware. First-batch UI work should prove EPUB/structured HTML and Website/Paste read-along states across phone, constrained desktop, desktop, and large desktop, including partial readable source, unchecked first audio, checked/stale/replaced segments, honest sync fallback, durable resume, repair supersession, and Quick Listen promotion into a durable `Design for the Real World`-style project source.

`AGREED UI DIRECTION`
