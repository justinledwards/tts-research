# ChatGPT TTS best-in-class architecture v7 response

Conversation: `https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a50c8cb-e78c-83eb-a0b9-c9876c99b4fe`

Reviewed archive: `tts-best-in-class-v7-20260710T101606Z.zip`

SHA-256: `3861aff7b2c3c89b1e0cce6f359eac1c58616f4903b328d763a11b1f966cda4f`

Model: `GPT-5.6 Sol`

Reasoning tier: `Pro`

Review duration: `19m 2s`

> REQUEST_CHANGES TTS BEST-IN-CLASS ARCHITECTURE BATCH
>
> Linear creation may proceed: NO.

## 1. Router analysis still drops reachable receiver states and silently skips adjacent control flow

Paths:

- `backend/cmd/flow-route-inventory/main.go:279-298`
- `backend/cmd/flow-route-inventory/main.go:349-421`
- `backend/cmd/flow-route-inventory/main.go:463-742`
- `backend/cmd/flow-route-inventory/main_test.go`

### Exact probe A — conditional parallel receiver mutation

```go
package sample

import "github.com/gofiber/fiber/v3"

func api(app *fiber.App, different bool) fiber.Router {
	router := app.Group("/same")
	other := app.Group("/different")
	if different {
		other, router = router, other
	}
	return router
}

func routes(app *fiber.App, different bool) {
	api(app, different).Get("/x", nil)
}
```

Run the exact archived command source against the fixture:

```bash
cd backend
go run ./cmd/flow-route-inventory --root /path/to/fixture
```

Observed: exit status `0`, emitting only:

```json
{
  "routes": [
    {
      "method": "GET",
      "path": "/same/x"
    }
  ]
}
```

With `different == true`, Go's simultaneous-assignment semantics make `router` equal `/different`; the reachable runtime route is `GET /different/x`. `assignReceivers` mutates the environment while evaluating successive right-hand sides, so the second right-hand side reads the already-modified value instead of the pre-assignment environment.

### Exact probe B — receiver mutation outside a returned helper

```go
package sample

import "github.com/gofiber/fiber/v3"

func routes(app *fiber.App, different bool) {
	router := app.Group("/same")
	if different {
		router = app.Group("/different")
	}
	router.Get("/x", nil)
}
```

Observed: exit status `0`, emitting only `GET /same/x`. The branch environment is cloned and discarded by `analyzeStatement`; the reachable `GET /different/x` registration is omitted instead of causing ambiguity rejection.

The equivalent range mutation also succeeds incorrectly:

```go
func routes(app *fiber.App, values []int) {
	router := app.Group("/same")
	for range values {
		router = app.Group("/different")
	}
	router.Get("/x", nil)
}
```

Observed: exit status `0`, emitting only `GET /same/x`, although a non-empty range reaches `GET /different/x`.

### Exact probe C — direct TypeSwitch and Select registrations

```go
package sample

import "github.com/gofiber/fiber/v3"

func routes(app *fiber.App, value any, ch <-chan struct{}) {
	switch value.(type) {
	case string:
		app.Get("/type", nil)
	}
	select {
	case <-ch:
		app.Get("/select", nil)
	default:
	}
}
```

Observed: exit status `0` with:

```json
{
  "schemaVersion": "tts-research.route-inventory.v2",
  "sourceFiles": 0,
  "routes": null
}
```

`analyzeStatement` has no `TypeSwitchStmt` or `SelectStmt` handling and silently ignores both registrations.

Expected: all reachable receiver environments and registrations must be retained. A route call reachable through conflicting prefixes must reject as ambiguous. TypeSwitch, Select, Range, and other modeled branch forms must be traversed; unsupported receiver-affecting forms must fail closed. Simultaneous assignments must be evaluated against the pre-assignment environment and applied atomically.

Bounded repair: use one continuation-based, path-sensitive statement engine for both returned-router evaluation and ordinary route registration instead of retaining the separate lossy `analyzeStatement` walker. Evaluate all assignment right-hand sides before changing the receiver environment; reject unsupported tuple/multi-result cases. Add negative tests for the three probes above, including direct conditional/range mutation and TypeSwitch/Select registrations.

## 2. Executable transition evidence still accepts unreachable assertions and non-test registrations

Paths:

- `scripts/validate-flow-registry.mjs:475-544`
- `scripts/validate-flow-registry.test.mjs`
- `backend/cmd/flow-symbol-inventory/main.go:67-123`
- `backend/cmd/flow-symbol-inventory/main_test.go`

### Exact probe A — unreachable TypeScript assertion

```ts
test("dead cited case", () => {
  return;
  flowAssert("FLOW_ASSERT:APP-BOOT-001:APP-BOOT-001:T01:entry");
});
```

Starting with the canonical manifest, cite this case for `APP-BOOT-001:T01:entry` and remove that transition from its planned-evidence entry, then run `validateFlowRegistry`.

Observed: canonical validation succeeds and reports:

```json
{
  "accepted": true,
  "flow": "APP-BOOT-001",
  "transition": "APP-BOOT-001:T01:entry",
  "covered": 1,
  "planned": 676
}
```

`caseHasFlowAssertion` recursively finds the call after the unconditional `return`, even though it cannot execute.

The same scanner also accepts a registration that is not a test-runner declaration:

```ts
const test = (...args: unknown[]) => void args;
test("target", () => {
  flowAssert("FLOW_ASSERT:APP-BOOT-001:APP-BOOT-001:T01:entry");
});
```

Observed: `executableCaseBodies` contains `target`, and `caseHasFlowAssertion` returns `true`. The `test` identifier is locally shadowed and never registers a runnable test.

A declaration under an impossible branch is likewise accepted:

```ts
if (false) {
  test("target", () => {
    flowAssert("FLOW_ASSERT:APP-BOOT-001:APP-BOOT-001:T01:entry");
  });
}
```

Observed: the case is discovered and its assertion is accepted.

### Exact probe B — unreachable Go assertion

```go
package sample

import "testing"

func TestTarget(t *testing.T) {
	return
	flowAssert(t, "FLOW_ASSERT:APP-BOOT-001:APP-BOOT-001:T01:entry")
}
```

Observed: `executableCaseBodies` discovers `TestTarget`, and `caseHasFlowAssertion` returns `true`. `directFlowAssertions` performs an unrestricted AST inspection and does not exclude statements after a terminating return. A call inside `if false` is accepted for the same reason.

Expected: only reachable `flowAssert(...)` calls in registrations that resolve to actual test-runner declarations may establish transition coverage. Calls after unconditional termination, inside statically impossible branches, or under a shadowed/non-runner `test` binding must not count.

Bounded repair: add conservative control-flow reachability for TypeScript callbacks and Go test bodies, stopping after unconditional terminators and excluding statically impossible branches; fail closed on unsupported control-flow constructs. Resolve TypeScript `test`/`it` registrations to unshadowed configured globals or known imported runner bindings rather than matching identifier text alone. Add exact after-return, `if (false)`, and shadowed-runner negative fixtures for both discovery and assertion validation.

## Gate outcome

No Linear mutation is permitted. Replacement issues created: `0`.
