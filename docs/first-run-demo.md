# First-Run Demo Mode

Demo mode is the zero-service path through Voice Studio. It uses the existing mock provider stack and
sample text fixtures so a new contributor can understand the product before configuring local models
or cloud credentials.

## Start The Demo Stack

```sh
pnpm start:mock
```

This starts the backend with `TTS_PROVIDER=mock` and `VOICE_CHECKER_PROVIDER=mock`, then serves the
frontend through the normal local app. No model download, external API key, or private service is
required.

## Try The Studio

Open the app and use **Try the Studio** in the first viewport. The demo panel includes six sample
projects:

- Short Education Reading
- Technical Markdown Document
- Website Article
- EPUB Chapter
- Teleprompt Script
- Voice Comparison Sample

Selecting a sample loads draft text, voice intent, policy intent, and workspace context in memory.
It does not create a project, source, job, or generated audio record by itself.

## Full Workflow

Use the tour buttons to move through:

- Intake
- Review
- Preview
- A/B comparison in Preview
- Teleprompt
- Create mock audio
- Cinema
- Bookmark and resume from Cinema

Cinema is intentionally gated behind the real production path. When the contributor clicks
**Create & Listen**, the mock provider creates local generated audio, then the normal Preview and
Cinema surfaces become available. That click is the explicit point where demo work becomes local
project data.

## Storage Contract

Demo mode is a thin wrapper over real workspace state:

- Demo sample selection is in-memory only.
- Project autosave is paused while an unsaved demo sample is active.
- Creating audio through **Create & Listen** exits unsaved demo mode and stores the job in the active
  local project.
- Demo fixtures are inline local content; they do not fetch websites, provider voices, or private
  project data.
- Imported files, prepared sources, generated audio, and progress still live under ignored runtime
  paths such as `backend/data/` and `output/`.

## What To Verify

For a first-run QA pass:

- Start from a clean checkout.
- Run `pnpm start:mock`.
- Load each demo sample from **Try the Studio**.
- Move through Intake, Review, Preview, and Teleprompt.
- Use **Create & Listen** on one sample and open Cinema.
- Confirm the flow never asks for a cloud API key or local model download.
