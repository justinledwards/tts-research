import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";

import { buildReviewArchive, validateSourceClosure } from "./build-chatgpt-review-archive.mjs";

async function temporaryDirectory(name) {
  return mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

async function put(root, relativePath, contents) {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

async function initializeRepository(files) {
  const root = await temporaryDirectory("review-archive-repo");
  git(root, "init", "-q");
  git(root, "config", "user.email", "archive-test@example.invalid");
  git(root, "config", "user.name", "Archive Test");
  for (const [relativePath, contents] of Object.entries(files))
    await put(root, relativePath, contents);
  git(root, "add", ".");
  git(root, "commit", "-qm", "fixture baseline");
  return root;
}

function entry(contents) {
  return { bytes: Buffer.from(contents), mode: 0o644, symlink: false };
}

async function expectClosureFailure(entries, pattern) {
  const root = await temporaryDirectory("review-closure");
  try {
    const files = new Map(
      Object.entries(entries).map(([name, contents]) => [name, entry(contents)]),
    );
    await assert.rejects(validateSourceClosure(root, files), pattern);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

test("archive capture is uncapped, complete, deterministic, and reverse-applicable", async () => {
  const largeBaseline = Array.from(
    { length: 90_000 },
    (_, index) => `baseline-${String(index).padStart(6, "0")}-aaaaaaaa\n`,
  ).join("");
  const largePostimage = largeBaseline.replaceAll("aaaaaaaa", "bbbbbbbb");
  const root = await initializeRepository({
    "large-source.txt": largeBaseline,
    "nested/tracked.txt": "tracked\n",
  });
  const outputOne = path.join(await temporaryDirectory("review-output-one"), "review.zip");
  const outputTwo = path.join(await temporaryDirectory("review-output-two"), "review.zip");
  try {
    await put(root, "large-source.txt", largePostimage);
    await put(root, "nested/untracked-source.ts", "export const untracked = true;\n");

    const first = await buildReviewArchive({ root, output: outputOne, prefix: "review" });
    const second = await buildReviewArchive({ root, output: outputTwo, prefix: "review" });
    assert.equal(first.modifiedPathCount, 1);
    assert.equal(first.sourceFileCount, 3);
    assert.deepEqual(second, { ...first, outputPath: outputTwo });
    assert.deepEqual(await readFile(outputOne), await readFile(outputTwo));

    const archive = await JSZip.loadAsync(await readFile(outputOne));
    const names = Object.keys(archive.files).filter((name) => !archive.files[name].dir);
    assert(names.includes("review/nested/tracked.txt"));
    assert(names.includes("review/nested/untracked-source.ts"));
    const fileList = await archive.file("review/_review/file-list.txt").async("string");
    assert.equal(fileList, "large-source.txt\nnested/tracked.txt\nnested/untracked-source.ts\n");
    const patch = await archive.file("review/_review/git-diff.patch").async("nodebuffer");
    assert(patch.length > 1_000_000, `expected an uncapped patch, got ${patch.length} bytes`);
    assert(!patch.includes("OUTPUT TRUNCATED"));
    assert.match(patch.toString("utf8"), /diff --git a\/large-source\.txt b\/large-source\.txt/);
    const status = await archive.file("review/_review/git-status.txt").async("string");
    assert.match(status, /^ M large-source\.txt$/m);
  } finally {
    await Promise.all([
      rm(root, { force: true, recursive: true }),
      rm(path.dirname(outputOne), { force: true, recursive: true }),
      rm(path.dirname(outputTwo), { force: true, recursive: true }),
    ]);
  }
});

test("archive rejects status/patch path drift instead of omitting staged changes", async () => {
  const root = await initializeRepository({ "tracked.txt": "before\n" });
  const output = path.join(await temporaryDirectory("review-parity-output"), "review.zip");
  try {
    await put(root, "tracked.txt", "after\n");
    git(root, "add", "tracked.txt");
    await assert.rejects(
      buildReviewArchive({ root, output }),
      /provenance patch\/status modified-path mismatch/,
    );
  } finally {
    await Promise.all([
      rm(root, { force: true, recursive: true }),
      rm(path.dirname(output), { force: true, recursive: true }),
    ]);
  }
});

test("source closure rejects missing workspace importers and local entry imports", async () => {
  await expectClosureFailure(
    {
      "pnpm-workspace.yaml": 'packages:\n  - "frontend"\n',
      "pnpm-lock.yaml": "importers:\n  .: {}\n  frontend: {}\n",
    },
    /pnpm workspace importer is missing: frontend\/package\.json/,
  );

  await expectClosureFailure(
    {
      "pnpm-workspace.yaml": 'packages:\n  - "frontend"\n',
      "pnpm-lock.yaml": "importers:\n  .: {}\n  frontend: {}\n",
      "frontend/package.json": '{"name":"frontend"}\n',
      "frontend/src/main.tsx": 'import { App } from "./App";\nvoid App;\n',
    },
    /local import from frontend\/src\/main\.tsx is unresolved: frontend\/src\/App/,
  );
});

test("source closure rejects every manifest evidence and required-symbol source omission", async () => {
  await expectClosureFailure(
    {
      "docs/flows/manifest.json": JSON.stringify({
        flows: [
          {
            id: "APP-FIRST-RUN-001",
            testEvidence: [{ path: "frontend/src/features/intake/intakeWizardModel.test.ts" }],
          },
        ],
        requiredStateSymbols: [],
      }),
    },
    /flow APP-FIRST-RUN-001 evidence is missing: frontend\/src\/features\/intake\/intakeWizardModel\.test\.ts/,
  );

  await expectClosureFailure(
    {
      "docs/flows/manifest.json": JSON.stringify({
        flows: [],
        requiredStateSymbols: [
          { symbol: "frontend/src/features/playback/playbackState.ts#PlaybackState" },
        ],
      }),
    },
    /required state-symbol source is missing: frontend\/src\/features\/playback\/playbackState\.ts/,
  );
});

test("source closure rejects every checked-in fixture reference form", async () => {
  for (const [source, expected] of [
    [
      'markdown, err := os.ReadFile(filepath.Join("..", "..", "..", "demo", "deep-research-report.md"))\n',
      "demo/deep-research-report.md",
    ],
    [
      'const dir = path.join(root, "fixtures", "golden-minute");\npath.join(dir, "manifest.json");\n',
      "fixtures/golden-minute/manifest.json",
    ],
    [
      'const dir = path.join(root, "fixtures/contracts");\nconst fixture = "readalong-current.readalong-manifest.v1.json";\n',
      "fixtures/contracts/readalong-current.readalong-manifest.v1.json",
    ],
    [
      'const manifest = configured.manifest ?? "fixtures/sync/manifest.json";\n',
      "fixtures/sync/manifest.json",
    ],
  ]) {
    await expectClosureFailure(
      { "scripts/reference.mjs": source },
      new RegExp(
        `checked-in repository fixture reference is missing: ${expected.replaceAll("/", "\\/").replaceAll(".", "\\.")}`,
      ),
    );
  }
});
