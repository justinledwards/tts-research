#!/usr/bin/env node

export const fastCommandBatchA = [
  {
    id: "format-check",
    title: "Format Check",
    command: "pnpm",
    args: ["format:check"],
  },
  {
    id: "lint",
    title: "Lint",
    command: "pnpm",
    args: ["lint"],
  },
];

export const fastCommandBatchB = [
  {
    id: "typecheck",
    title: "Typecheck",
    command: "pnpm",
    args: ["typecheck"],
  },
  {
    id: "package-tests",
    title: "Package Tests",
    command: "pnpm",
    args: ["package:test:core"],
  },
  {
    id: "script-tests",
    title: "Script Tests",
    command: "pnpm",
    args: ["test:scripts"],
  },
  {
    id: "backend-tests",
    title: "Backend Tests",
    command: "pnpm",
    args: ["--filter", "@tts-research/backend", "test"],
  },
  {
    id: "adapter-tests",
    title: "Adapter Tests",
    command: "pnpm",
    args: ["test:adapters"],
  },
  {
    id: "frontend-tests",
    title: "Frontend Tests",
    command: "pnpm",
    args: ["--filter", "@tts-research/frontend", "test"],
  },
  {
    id: "content-ir-validation",
    title: "Content IR Validation",
    command: "pnpm",
    args: ["validate:ir"],
  },
];

export const packageBuildStep = {
  id: "package-build",
  title: "Package Build",
  command: "pnpm",
  args: ["package:build"],
};

export const releaseCommandSteps = [
  {
    id: "package-smoke",
    title: "Package Smoke",
    command: "pnpm",
    args: ["package:smoke"],
  },
  {
    id: "cli-parity",
    title: "CLI Parity",
    command: "pnpm",
    args: ["cli:parity"],
  },
];
