# Golden-Minute Human Review

Use this script when automated golden-minute metrics pass but a reviewer still needs to judge speech
fluency, highlight comfort, and presenter ergonomics by eye and ear. It is written for local QA, PR
review, and contributor handoff.

## Prerequisites

- A local checkout with dependencies installed.
- Speakers or headphones.
- A browser that can open the local app.
- The golden-minute fixture: `fixtures/golden-minute/sample.md`.
- Optional automated evidence from `pnpm e2e:golden-minute` in `output/golden-minute/latest/`.

## Start The Local Mock Stack

Open a terminal at the repository root and run:

```sh
pnpm start:mock
```

Wait until the frontend URL is printed, then open the app. The default local URL is usually
`http://127.0.0.1:5173`.

## Create Or Open The Golden-Minute Project

- [ ] Open the Project Dashboard.
- [ ] If a recent `Golden Minute QA ...` project exists, open it.
- [ ] Otherwise create a project named `Golden Minute Human QA`.
- [ ] In Intake, choose a file source and select `fixtures/golden-minute/sample.md`.
- [ ] Advance to Review.

## One-Minute Review Script

- [ ] In Review, confirm the heading `Golden Minute Calibration` and paragraph blocks are visible.
- [ ] Open Preview and play the speech preview once. Listen for unnatural pronunciation, skipped
      words, or citation text being spoken when it should stay silent.
- [ ] Select `Create & Listen`. Wait for mock audio to finish generating and show as ready.
- [ ] Open Cinema.
- [ ] Press Play and watch the highlight for the full minute. Do not seek during the first pass.
- [ ] Seek backward and forward at least twice. Confirm the highlight, visible passage, and audio
      time recover together.
- [ ] Change speed to a slower setting and a faster setting. Confirm the highlight remains readable
      and does not jump backward at segment boundaries.
- [ ] Toggle phrase and word highlight from Read-along Settings. Confirm phrase fallback is honest
      and word mode does not claim accuracy when it looks degraded.
- [ ] Open More, then Diagnostics or Timing map. Confirm the sync debug overlay is available.
- [ ] If a highlight looks wrong, select `Mark highlight wrong here`, then `Copy sync debug
      snapshot` or `Export sync debug snapshot`.
- [ ] Enter Teleprompt Theatre. Read the current cue and next cue for readability at normal viewing
      distance.
- [ ] Return to Cinema. Confirm playback state, highlight mode, and source position are still
      understandable.

## What To Capture For Each Finding

Attach findings to the PR review with enough evidence to reproduce the moment:

- Rating category from the rubric below.
- Current audio timestamp, such as `00:47.0`.
- Source locator or active passage from the sync debug snapshot.
- Active segment, phrase, and word from the sync debug snapshot.
- Artifact identity when available:
  - `sourceRevisionId`
  - `speechPlanId`
  - `policyProfileId`
  - `voiceProfileId`
  - `generatedAudioId`
  - `highlightMapId`
  - `alignmentMapId`
- Screenshot of the current Cinema or Teleprompt state.
- Exported `sync-debug-snapshot.json` when the issue is about highlight drift.
- Relevant automated report path, usually `output/golden-minute/latest/golden-minute-report.md` or
  `output/golden-minute/latest/artifact-compatibility-report.md`.

## Rating Rubrics

Use 1-5 ratings. A `1` blocks PR-ready evidence. A `3` is usable with notes. A `5` is release-quality.

| Category | 1 | 3 | 5 |
| --- | --- | --- | --- |
| Speech fluency | Robotic, clipped, repeated, or hard to follow | Understandable with a few rough seams | Natural pacing and intelligible throughout |
| Pause quality | Pauses are missing, excessive, or confusing | Some pauses feel mechanical but not misleading | Sentence, paragraph, and natural pauses feel intentional |
| Highlight accuracy | Highlight often points to the wrong word, phrase, or block | Occasional drift that recovers quickly | Highlight stays aligned across playback, seek, and speed changes |
| Scroll comfort | Current passage leaves view or jumps abruptly | Minor jumps, still usable | Current passage remains comfortably visible |
| Teleprompt readability | Cue size, contrast, or placement blocks presenting | Readable with some adjustment | Comfortable at presentation distance with clear current and next cues |
| Control clarity | Tester cannot find or understand key controls | Controls work after some searching | Controls are discoverable, labeled, and predictable |

## One-Page Reporting Template

Copy this into the PR review or attach it as a Markdown note.

```md
# Golden-Minute Human QA Report

Reviewer:
Date:
Branch or commit:
Browser:
Viewport/device:
Audio output:
Project name:

## Summary

Overall result: Pass / Pass with findings / Blocked
One-sentence verdict:

## Ratings

| Category | Rating 1-5 | Notes |
| --- | ---: | --- |
| Speech fluency |  |  |
| Pause quality |  |  |
| Highlight accuracy |  |  |
| Scroll comfort |  |  |
| Teleprompt readability |  |  |
| Control clarity |  |  |

## Findings

### Finding 1

Severity: Blocking / Needs review / Informational
Category:
Audio timestamp:
Source locator:
Active segment:
Active phrase:
Active word:
Artifact IDs:
- sourceRevisionId:
- speechPlanId:
- policyProfileId:
- voiceProfileId:
- generatedAudioId:
- highlightMapId:
- alignmentMapId:
Steps to reproduce:
Expected:
Observed:
Attached files:
- screenshot:
- sync-debug-snapshot.json:
- related report:

## Sign-Off

- [ ] Full minute watched without seeking.
- [ ] Seek backward and forward checked.
- [ ] Speed change checked.
- [ ] Phrase and word highlight checked.
- [ ] Teleprompt Theatre checked.
- [ ] Drift markers exported for every highlight issue.
```

## Validation

Before filing the manual report, run:

```sh
pnpm e2e:golden-minute
```

Then complete this human QA script. If the automated command fails, attach the failing report and
pause manual sign-off until the automated evidence is repaired.
