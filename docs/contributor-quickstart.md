# Contributor Quickstart

This is the shortest path from a clean checkout to a working Voice Studio demo.

## 1. Install Pinned Tools

```sh
mise install
mise setup
```

`mise setup` installs JavaScript dependencies, prepares local runtime folders, and avoids committing
generated data.

## 2. Run Mock Mode

```sh
pnpm start:mock
```

Mock mode is the recommended first run. It uses deterministic local providers for text-to-speech and
voice checks, so contributors can test the Studio without cloud services, private models, or large
downloads.

## 3. Open The Studio

Use the frontend URL printed by the start script, then choose **Try the Studio**.

Recommended first path:

1. Select **Short Book Walkthrough**.
2. Open **Review** and inspect the sample blocks.
3. Open **Preview** and confirm the spoken form.
4. Open **Teleprompt** and step through cues.
5. Click **Create & Listen** to generate mock audio.
6. Open **Cinema** for full playback.

The demo does not write project data until a contributor explicitly creates audio, imports a source,
or saves a project artifact.

## 4. Validate Before Sending Work Back

```sh
pnpm check
pnpm e2e:workspace-flow
pnpm e2e:ui-actions
pnpm validate:local
```

For performance-sensitive changes, also run:

```sh
pnpm bundle:local
pnpm bench:local
pnpm e2e:book-cinema:low-resource
```

Reports and screenshots are written under ignored `output/` paths.

## 5. When To Leave Mock Mode

Move to `pnpm start:local` only after the mock demo path works. Local provider setup is documented in
`docs/runtime-setup.md`; optional providers should remain opt-in and should never be required for the
first-run demo.
