#!/usr/bin/env node
import { runVoiceStudioCli } from "./run.js";

runVoiceStudioCli(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
