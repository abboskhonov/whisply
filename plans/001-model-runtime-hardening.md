# Plan 001: Harden the local model lifecycle

> **Executor instructions**: Follow this plan in order. Run every verification
> command before proceeding. If a STOP condition occurs, stop and report it;
> do not improvise. Update `plans/README.md` when complete.
>
> **Drift check**: `git diff --stat 4c9f5eb..HEAD -- src-tauri/src/models.rs src-tauri/src/transcription.rs src-tauri/src/dictation.rs src-tauri/Cargo.toml src-tauri/Cargo.lock .github/workflows/release.yml`
> If the code below no longer matches the live code, stop and reconcile the
> plan before changing production code.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: correctness, security, performance, tests
- **Planned at**: commit `4c9f5eb`, 2026-07-18

## Why this matters

Whisply runs large local ONNX speech models, so model lifecycle failures are
visible to users as failed dictation, unexpectedly high resource use, or a
forced re-download. The current inference architecture is fundamentally sound:
it creates a fresh `OfflineStream` for each dictation, serializes access to the
cached recognizer, and caps CPU inference threads at four.

This plan addresses four gaps around that core. It makes model replacement safe
and verifiable, avoids decoding work that the user already cancelled, prevents
a delayed-unload thread from being spawned per dictation, and makes model
compatibility tests actually run in CI. The intended result is more reliable
model setup, faster cancellation, predictable idle resource use, and release
checks that exercise real recognition.

## Issues, fixes, and expected improvements

| Issue | Why it is a problem | Proposed fix | What improves |
|---|---|---|---|
| Cancelled dictations still enter model decoding | Escape marks a generation cancelled, but the worker calls `transcribe()` before checking that state. A cancelled long recording can still load a model, consume CPU, and block the sole recognizer mutex. | Add an activity check immediately before model work, while retaining the existing post-decode check for work already in native inference. | Escape cancellation drops queued work promptly; a newer dictation reaches the recognizer sooner. |
| Model replacement is destructive before verification | Archive installation deletes the current model directory before extraction; file installation deletes it before rename. A failed extraction, failed rename, or invalid artifact can leave a selected model unavailable. | Download/extract into a unique staging directory, verify it, then atomically swap it into place with rollback if the final replacement fails. | Existing working models survive failed or cancelled replacements. |
| Downloaded artifacts are only checked by minimum file size | A wrong or corrupt artifact larger than the threshold is accepted, selected, and only fails when the user next dictates. | Pin a SHA-256 digest for every downloaded source file/archive; verify before extraction and validate the final installed model files before selection. | Corruption and unexpected upstream artifacts fail during setup with a clear reinstall error. Existing installed files that match the expected final hashes stay usable without re-download. |
| Delayed unloading spawns a sleeping OS thread per dictation | The revision check prevents old timers from unloading the model, but it does not reclaim their threads until each timeout expires. | Replace the per-dictation sleep thread with one resettable timer worker/channel, or an equivalent single scheduled worker. | Frequent dictation with delayed unloading no longer accumulates sleeping threads and retained `AppHandle`s. |
| Model tests silently skip without local environment variables | `cargo test` can pass without instantiating either recognizer or decoding a fixture. | Add mandatory, pinned test fixtures or a dedicated required CI model-test job covering both model formats. | Releases catch model/configuration incompatibilities before users download a model. |

## Current state

### Inference and cancellation

- `src-tauri/src/dictation.rs:141-146` spawns a transcription worker and calls
  `TranscriptionState::transcribe()` before checking whether its generation is
  still active.
- `src-tauri/src/dictation.rs:148-154` checks `is_active(generation)` only
  after native decoding completes.
- `src-tauri/src/transcription.rs:152-171` holds the cached recognizer mutex
  through recognizer creation, stream creation, waveform acceptance, and
  `decode()`.
- `src-tauri/src/transcription.rs:123-140` starts one sleeping thread for each
  delayed unload request; revisions only suppress obsolete unload actions.

### Installation and verification

- `src-tauri/src/models.rs:244-268` validates installed model directories by
  regular-file status and minimum byte length only.
- `src-tauri/src/models.rs:425-440` removes an archive model's live directory
  before extracting and validating its replacement.
- `src-tauri/src/models.rs:536-539` removes a file-based model's live directory
  before renaming the validated staging directory into place.
- `src-tauri/src/models.rs:29-43` defines `ModelSource` and is the appropriate
  location for pinned artifact digest metadata.
- GigaAM files are modified by `add_gigaam_metadata()` in
  `src-tauri/src/models.rs:270-296`; any final-file digest must account for the
  exact post-processing bytes.

### Test coverage

- `src-tauri/src/transcription.rs:246-270` returns from recognizer tests when
  `WHISPLY_TEST_MODEL_DIR` or `WHISPLY_TEST_GIGAAM_MODEL_DIR` is absent.
- `src-tauri/src/models.rs:627-660` covers catalog IDs and GigaAM metadata
  bytes, but not an installation transaction, invalid model rejection, or
  recognition with the shipped formats.
- `.github/workflows/release.yml` builds the release but does not run a model
  fixture/compatibility test job.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Frontend typecheck | `bun run typecheck` | exit 0 |
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml` | exit 0; all unit tests pass |
| Full frontend build | `bun run build` | exit 0 |
| Diff hygiene | `git diff --check` | no output, exit 0 |

## Scope

**In scope**

- `src-tauri/src/dictation.rs`
- `src-tauri/src/transcription.rs`
- `src-tauri/src/models.rs`
- `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock` only if a SHA-256 crate is
  needed
- `.github/workflows/release.yml` or a new focused CI workflow for required
  model compatibility checks
- focused Rust tests colocated in `models.rs` and `transcription.rs`, or a
  dedicated Rust integration-test target

**Out of scope**

- Changing the speech models, their user-facing names, or CPU thread limit.
- Streaming transcription, VAD, model download UX redesign, or changing
  dictation history.
- Requiring all existing users to download models again. Matching installed
  files must remain valid after migration.

## Git workflow

- Branch: `fix/model-runtime-hardening`
- Use the repository's conventional commit style, for example
  `fix: capture Wayland shortcuts exclusively`.
- Do not push or open a PR unless the operator explicitly requests it.

## Steps

### Step 1: Add cancellation gates before recognizer work

In `src-tauri/src/dictation.rs`, expose only the minimal `DictationState`
activity check necessary to test the worker's generation before calling
`transcription.transcribe()`. If the generation is inactive at that point,
return the existing `"Dictation was cancelled"` outcome without loading or
locking the recognizer. Keep the existing post-decode activity check because
native `decode()` cannot be assumed interruptible.

Add unit tests that characterize an inactive generation as discarded before
transcription is requested. Keep the current cancellation and commit semantics
in `DictationState` intact.

**Verify**: `cargo test --manifest-path src-tauri/Cargo.toml dictation` exits 0.

### Step 2: Replace per-dictation unload sleepers with one resettable schedule

In `src-tauri/src/transcription.rs`, preserve the public behavior of
`ModelMemorySettings`:

- `keep_loaded = true` never schedules an unload.
- `unload_after_minutes = 0` unloads immediately.
- a positive delay unloads only after the most recent completed transcription.

Replace `std::thread::spawn` + `sleep` per call with one worker or equivalent
resettable deadline mechanism owned by `TranscriptionState`. It must not hold
the recognizer mutex while waiting. Updating memory settings must invalidate any
existing schedule.

Add deterministic tests for immediate unloading, reset-on-new-use behavior, and
at most one live delayed-unload worker. Do not use multi-minute real sleeps in
tests; inject or isolate the scheduling primitive so tests can use a short
controlled delay.

**Verify**: `cargo test --manifest-path src-tauri/Cargo.toml transcription` exits 0.

### Step 3: Make installation transactional and verify artifact integrity

Extend `ModelSource`/`ModelFile` in `src-tauri/src/models.rs` with expected
SHA-256 metadata from the published artifacts. For archives, hash the completed
`.part` download before extraction. For individual files, hash each completed
temporary file before any GigaAM metadata is appended.

Install archives into a uniquely named staging location under the app models
directory. Validate the staged directory and, for each model format, verify that
a recognizer can initialize from it before replacing the live directory. For
file installs, retain the existing temporary directory approach but add the
same digest and recognizer checks before replacement.

Only replace the live model after all verification succeeds. If an existing
live directory must be moved aside to perform a platform-compatible rename,
restore it on any replacement failure. Delete the previous directory only after
the new model is live and selected. Preserve existing valid installs: validate
against final installed-file hashes, including GigaAM's deterministic metadata
append, rather than forcing a download solely because the settings format is
new.

Use explicit errors that identify the failed phase (`download verification`,
`model validation`, or `recognizer initialization`) without exposing unrelated
filesystem details to the UI.

**Verify**: `cargo test --manifest-path src-tauri/Cargo.toml models` exits 0.

### Step 4: Make model compatibility testing required in CI

Add a small, pinned model fixture strategy that can run both Parakeet and
GigaAM recognizer initialization and decode a known WAV. Prefer a dedicated CI
job with cached, version-pinned assets over committing large model binaries to
the repository. The job must fail—not silently skip—when its fixture is absent
or a recognizer cannot initialize.

Update the existing optional tests in `src-tauri/src/transcription.rs` so they
are either required by that job or clearly separated as opt-in local tests;
`cargo test` must still have meaningful unit coverage without external model
downloads.

Add tests for:

- rejected missing, undersized, and digest-mismatched model files;
- preservation of the previous live model when staged installation fails;
- successful cache reuse and replacement when model directories differ;
- recognizer initialization and known-sample decoding for both supported
  formats in the required CI job.

**Verify**: `cargo test --manifest-path src-tauri/Cargo.toml` exits 0, and the
new CI job is configured to fail if required fixtures are unavailable.

## Done criteria

- [ ] A cancelled generation is dropped before recognizer acquisition; the
  post-decode cancellation guard remains.
- [ ] Positive delayed-unload settings use one resettable schedule rather than
  one sleeping thread per dictation.
- [ ] Downloads are digest-verified and staged before the live model is
  touched.
- [ ] A failed replacement preserves a previously working model directory.
- [ ] Existing installed models that match final expected hashes work without a
  forced re-download.
- [ ] CI has a required non-skipping compatibility check for both model formats.
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml`, `bun run typecheck`,
  `bun run build`, and `git diff --check` exit successfully.

## STOP conditions

- A published immutable digest cannot be found for a model artifact. Stop and
  request a maintainer-approved source/version rather than inventing a digest.
- The model provider changes artifact bytes without a documented immutable
  release/version. Stop and report the version drift.
- Atomic replacement is not supported on a target filesystem and a safe
  backup/restore path cannot be tested. Stop before deleting a live model.
- A recognizer cannot initialize from a staged model on CI using the exact
  release build configuration. Stop and report the model/runtime mismatch.
- The intended fixture makes CI download several hundred megabytes on every
  run without an approved cache strategy. Stop and propose a cached dedicated
  job instead.

## Maintenance notes

- A model catalog update must update its artifact digests, required files, and
  pinned CI fixture in the same pull request.
- Reviewers should scrutinize replacement rollback paths and ensure no error
  path deletes the last known-good model.
- The current recognizer mutex intentionally serializes local inference to
  constrain memory use; do not remove it while implementing cancellation.
- Streaming recognition and changing model selection UX are intentionally
  deferred.
