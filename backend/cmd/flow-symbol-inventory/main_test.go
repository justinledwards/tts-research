package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func inventoryFromPathAndSource(t *testing.T, filePath, source string) inventory {
	t.Helper()
	var output bytes.Buffer
	if err := run([]string{"--stdin-path", filePath}, strings.NewReader(source), &output); err != nil {
		t.Fatal(err)
	}
	var result inventory
	if err := json.Unmarshal(output.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func inventoryFromSource(t *testing.T, source string) inventory {
	t.Helper()
	return inventoryFromPathAndSource(t, "fixture_test.go", source)
}

func inventoryFromRootFiles(t *testing.T, root string, files ...string) inventory {
	t.Helper()
	arguments := []string{"--root", root}
	for _, file := range files {
		arguments = append(arguments, "--file", file)
	}
	var output bytes.Buffer
	if err := run(arguments, strings.NewReader(""), &output); err != nil {
		t.Fatal(err)
	}
	var result inventory
	if err := json.Unmarshal(output.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func TestInventoryUsesDeclarationsAndExecutableTestAST(t *testing.T) {
	result := inventoryFromSource(t, `package fixture
import "testing"
type ReadyState struct{}
const ReadyStatus = "ready"
func TestDirect(t *testing.T) {
	flowAssert(t, "FLOW_ASSERT:direct")
	if true { flowAssert(t, `+"`FLOW_ASSERT:raw-direct`"+`) }
	local := func() { flowAssert(t, "FLOW_ASSERT:nested") }
	_ = local
}
`)
	if result.SchemaVersion != schemaVersion || len(result.Files) != 1 {
		t.Fatalf("inventory = %#v", result)
	}
	file := result.Files[0]
	if len(file.Declarations) != 3 {
		t.Fatalf("declarations = %#v", file.Declarations)
	}
	if len(file.Tests) != 1 || strings.Join(file.Tests[0].FlowAssertions, ",") != "FLOW_ASSERT:direct,FLOW_ASSERT:raw-direct" {
		t.Fatalf("tests = %#v", file.Tests)
	}
}

func TestInventoryRejectsCommentedAndStringifiedPseudoSyntax(t *testing.T) {
	result := inventoryFromSource(t, `package fixture
import "testing"
/*
type BlockedState struct{}
func TestBlocked(t *testing.T) { flowAssert(t, "FLOW_ASSERT:block") }
*/
var ordinary = "type OrdinaryStatus string; func TestOrdinary(t *testing.T) {}"
var raw = `+"`type RawPhase struct{}; func TestRaw(t *testing.T) {}`"+`
// type LineState struct{}
// func TestLine(t *testing.T) { flowAssert(t, "FLOW_ASSERT:line") }
func helper(t *testing.T) { flowAssert(t, "FLOW_ASSERT:helper") }
`)
	file := result.Files[0]
	for _, declaration := range file.Declarations {
		if declaration.Name != "ordinary" && declaration.Name != "raw" && declaration.Name != "helper" {
			t.Fatalf("pseudo-declaration discovered: %#v", declaration)
		}
	}
	if len(file.Tests) != 0 {
		t.Fatalf("pseudo-tests discovered: %#v", file.Tests)
	}
}

func TestInventoryRequiresActualGoTestSignature(t *testing.T) {
	result := inventoryFromSource(t, `package fixture
import "testing"
func Testlower(t *testing.T) { flowAssert(t, "FLOW_ASSERT:lower") }
func TestNoParameter() { flowAssert(nil, "FLOW_ASSERT:none") }
type receiver struct{}
func (receiver) TestMethod(t *testing.T) { flowAssert(t, "FLOW_ASSERT:method") }
func TestActual(t *testing.T) { flowAssert(t, "FLOW_ASSERT:actual") }
`)
	if len(result.Files[0].Tests) != 1 || result.Files[0].Tests[0].Name != "TestActual" {
		t.Fatalf("tests = %#v", result.Files[0].Tests)
	}
}

func TestInventoryRejectsV8StaticFalseComparisonsAndShortCircuitAssertions(t *testing.T) {
	result := inventoryFromSource(t, `package fixture
import "testing"
func TestComparison(t *testing.T) { if 1 == 2 { flowAssert(t, "FLOW_ASSERT:comparison") } }
func TestShortCircuit(t *testing.T) { false && flowAssert(t, "FLOW_ASSERT:short-circuit") }
func TestReachable(t *testing.T) { if 2 > 1 { flowAssert(t, "FLOW_ASSERT:reachable") } }
`)
	for _, testCase := range result.Files[0].Tests {
		if testCase.Name == "TestReachable" {
			if strings.Join(testCase.FlowAssertions, ",") != "FLOW_ASSERT:reachable" {
				t.Fatalf("reachable assertions = %#v", testCase.FlowAssertions)
			}
			continue
		}
		if len(testCase.FlowAssertions) != 0 {
			t.Fatalf("statically unreachable assertions for %s = %#v", testCase.Name, testCase.FlowAssertions)
		}
	}
}

func TestInventoryTreatsTestingTerminalMethodsAsNonReturning(t *testing.T) {
	result := inventoryFromSource(t, `package fixture
import "testing"
func TestFatal(t *testing.T) { t.Fatal("stop"); flowAssert(t, "FLOW_ASSERT:fatal") }
func TestFatalf(t *testing.T) { t.Fatalf("%s", "stop"); flowAssert(t, "FLOW_ASSERT:fatalf") }
func TestFailNow(t *testing.T) { t.FailNow(); flowAssert(t, "FLOW_ASSERT:fail-now") }
func TestSkip(t *testing.T) { t.Skip("stop"); flowAssert(t, "FLOW_ASSERT:skip") }
func TestSkipf(t *testing.T) { t.Skipf("%s", "stop"); flowAssert(t, "FLOW_ASSERT:skipf") }
func TestSkipNow(t *testing.T) { t.SkipNow(); flowAssert(t, "FLOW_ASSERT:skip-now") }
`)
	for _, testCase := range result.Files[0].Tests {
		if len(testCase.FlowAssertions) != 0 {
			t.Fatalf("terminal assertion for %s = %#v", testCase.Name, testCase.FlowAssertions)
		}
	}
}

func TestInventoryAcceptsEvidenceOnlyFromActiveGoTestFiles(t *testing.T) {
	nonTest := inventoryFromPathAndSource(t, "fixture.go", `package fixture
import "testing"
func TestFake(t *testing.T) { flowAssert(t, "FLOW_ASSERT:fake") }
`)
	if len(nonTest.Files[0].Tests) != 0 {
		t.Fatalf("non-test file contributed evidence: %#v", nonTest.Files[0].Tests)
	}
	excluded := inventoryFromPathAndSource(t, "fixture_test.go", `//go:build linux && !linux

package fixture
import "testing"
func TestExcluded(t *testing.T) { flowAssert(t, "FLOW_ASSERT:excluded") }
`)
	if len(excluded.Files[0].Tests) != 0 || len(excluded.Files[0].Declarations) != 0 {
		t.Fatalf("build-excluded file contributed inventory: %#v", excluded.Files[0])
	}
	if runtime.GOOS == "linux" {
		windows := inventoryFromPathAndSource(t, "fixture_windows_test.go", `package fixture
import "testing"
func TestWindows(t *testing.T) { flowAssert(t, "FLOW_ASSERT:windows") }
`)
		if len(windows.Files[0].Tests) != 0 || len(windows.Files[0].Declarations) != 0 {
			t.Fatalf("GOOS-excluded virtual file contributed inventory: %#v", windows.Files[0])
		}
	}
	legacyExcluded := inventoryFromPathAndSource(t, "fixture_test.go", `// +build linux,!linux

package fixture
import "testing"
func TestLegacyExcluded(t *testing.T) { flowAssert(t, "FLOW_ASSERT:legacy-excluded") }
`)
	if len(legacyExcluded.Files[0].Tests) != 0 || len(legacyExcluded.Files[0].Declarations) != 0 {
		t.Fatalf("legacy-build-excluded virtual file contributed inventory: %#v", legacyExcluded.Files[0])
	}
}

func TestRootFileInventoryUsesGoBuildMatchFile(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("exact GOOS fixture asserts Linux selection")
	}
	root := t.TempDir()
	fixtures := map[string]string{
		"active_test.go": `package fixture
import "testing"
func TestActive(t *testing.T) { flowAssert(t, "FLOW_ASSERT:active") }
`,
		"fixture_windows_test.go": `package fixture
import "testing"
func TestWindows(t *testing.T) { flowAssert(t, "FLOW_ASSERT:windows") }
`,
		"legacy_test.go": `// +build linux,!linux

package fixture
import "testing"
func TestLegacyExcluded(t *testing.T) { flowAssert(t, "FLOW_ASSERT:legacy-excluded") }
`,
	}
	for name, source := range fixtures {
		if err := os.WriteFile(filepath.Join(root, name), []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	result := inventoryFromRootFiles(t, root, "active_test.go", "fixture_windows_test.go", "legacy_test.go")
	if len(result.Files) != 1 || result.Files[0].Path != "active_test.go" || len(result.Files[0].Tests) != 1 || result.Files[0].Tests[0].Name != "TestActive" {
		t.Fatalf("root/file inventory = %#v", result)
	}
}

func TestInventoryRejectsUnreachableAndUnsupportedFlowAssertions(t *testing.T) {
	result := inventoryFromSource(t, `package fixture
import "testing"
func TestAfterReturn(t *testing.T) {
	return
	flowAssert(t, "FLOW_ASSERT:after-return")
}
func TestIfFalse(t *testing.T) {
	if false { flowAssert(t, "FLOW_ASSERT:if-false") }
}
func TestBothBranchesTerminate(t *testing.T) {
	if condition { return } else { panic("stop") }
	flowAssert(t, "FLOW_ASSERT:after-terminating-if")
}
func TestUnsupportedBeforeAssertion(t *testing.T) {
	for condition {}
	flowAssert(t, "FLOW_ASSERT:after-unsupported")
}
func TestReachableBranch(t *testing.T) {
	if condition { flowAssert(t, "FLOW_ASSERT:reachable-branch") }
}
`)
	for _, test := range result.Files[0].Tests {
		if test.Name == "TestReachableBranch" {
			if strings.Join(test.FlowAssertions, ",") != "FLOW_ASSERT:reachable-branch" {
				t.Fatalf("reachable assertions = %#v", test.FlowAssertions)
			}
			continue
		}
		if len(test.FlowAssertions) != 0 {
			t.Fatalf("unreachable assertions for %s = %#v", test.Name, test.FlowAssertions)
		}
	}
}
