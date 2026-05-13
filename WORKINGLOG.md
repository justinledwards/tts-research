# Working Log

## 2026-05-11 09:08 EDT - Project Scaffold
- [x] Initialize repository and root project files
- [x] Add Go Fiber backend with typed mock TTS pipeline
- [x] Add Vite React Tailwind frontend
- [x] Configure Biome, ESLint, Husky, and git ignores
- [x] Install dependencies and generate lockfiles
- [x] Run checks and verify the scaffold

## 2026-05-11 09:30 EDT - Kokoro TTS Integration
- [x] Pin Kokoro-compatible Python tooling
- [x] Add Python Kokoro synthesis script
- [x] Add Go Kokoro TTS agent and env-based provider selection
- [x] Expose provider metadata in the API and frontend
- [x] Install Kokoro dependencies and generate lockfiles
- [x] Verify real Kokoro audio generation

## 2026-05-11 09:40 EDT - OpenRouter Voice Optimization
- [x] Inspect helper OpenRouter references without copying secrets
- [x] Add OpenRouter-backed VoiceOptimization agent
- [x] Add env configuration and rule-based fallback
- [x] Update docs and examples
- [x] Keep rotating free router and add few-shot optimizer examples
- [x] Expose optimizer provider metadata separately from TTS provider
- [x] Run checks and verify the OpenRouter optimization path

## 2026-05-11 10:03 EDT - Full Checker Loop PoC
- [x] Make voice jobs asynchronous with live stage state
- [x] Add local Qwen3-ASR-backed checker
- [x] Compare ASR transcript to optimized text and detect clean cutoffs
- [x] Retry/resume bounded incomplete segments and merge audio
- [x] Add numeric ASR normalization for spoken percentages and compact units
- [x] Poll job state from the frontend instead of static done markers
- [x] Run checks and verify full-cycle behavior

## 2026-05-12 08:51 EDT - Long Job Progress Feedback
- [x] Inspect timed-out checker behavior and clean stale processes
- [x] Add server-sent job progress updates
- [x] Show live stage details and animated processing indicators
- [x] Make source text read-only while a job is running
- [x] Improve long checker feedback and timeout visibility
- [x] Split long optimized text into bounded synthesis/checking segments
- [x] Run checks and verify long-job progress behavior

## 2026-05-12 10:06 EDT - Start Script
- [x] Add a single command startup script
- [x] Load root and backend environment files safely
- [x] Wire root package scripts to the startup script
- [x] Document local startup usage
- [x] Run checks and verify script behavior

## 2026-05-12 10:19 EDT - Streaming Optimizer And Retry Loop Repair
- [x] Inspect helper OpenRouter streaming code
- [x] Stream VoiceOptimization partial output into job state
- [x] Retry same-segment checker failures before exhausting
- [x] Keep clean cutoff resume behavior for partial audio
- [x] Run checks and verify progress events expose streamed optimizer text

## 2026-05-12 11:10 EDT - Final Audio Persistence
- [x] Stop exposing partial in-progress audio as final playback
- [x] Save completed job audio and metadata to disk
- [x] Cache-bust completed audio playback
- [x] Run checks and verify persistence behavior

## 2026-05-12 11:23 EDT - Persistent ASR Worker
- [x] Keep ASR verification on every segment
- [x] Reuse one loaded Qwen ASR worker across checks
- [x] Update docs and environment examples
- [x] Run checks
- [x] Restart local dev stack with persistent checker enabled
- [x] Verify live short job with Kokoro and Qwen ASR

## 2026-05-13 10:27 EDT - Git Artifact And Secret Audit
- [x] Ignore and remove generated artifacts
- [x] Stage intended source files only
- [x] Scan staged contents for secrets and artifacts
- [x] Commit locally
