package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"go/ast"
	"go/build"
	"go/build/constraint"
	"go/constant"
	"go/parser"
	"go/token"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

const schemaVersion = "tts-research.go-source-inventory.v1"

type stringFlags []string

func (values *stringFlags) String() string { return strings.Join(*values, ",") }
func (values *stringFlags) Set(value string) error {
	*values = append(*values, value)
	return nil
}

type declarationRecord struct {
	Name string `json:"name"`
	Kind string `json:"kind"`
}

type testRecord struct {
	Name           string   `json:"name"`
	FlowAssertions []string `json:"flowAssertions"`
}

type fileRecord struct {
	Path         string              `json:"path"`
	Declarations []declarationRecord `json:"declarations"`
	Tests        []testRecord        `json:"tests"`
}

type inventory struct {
	SchemaVersion string       `json:"schemaVersion"`
	Files         []fileRecord `json:"files"`
}

func testingImportAliases(file *ast.File) map[string]struct{} {
	aliases := map[string]struct{}{}
	for _, imported := range file.Imports {
		importPath, err := strconv.Unquote(imported.Path.Value)
		if err != nil || importPath != "testing" || imported.Name != nil && imported.Name.Name == "_" {
			continue
		}
		alias := "testing"
		if imported.Name != nil {
			alias = imported.Name.Name
		}
		aliases[alias] = struct{}{}
	}
	return aliases
}

func testFunction(function *ast.FuncDecl, testingAliases map[string]struct{}) bool {
	if function.Recv != nil || function.Body == nil || !strings.HasPrefix(function.Name.Name, "Test") || len(function.Name.Name) == len("Test") {
		return false
	}
	next, _ := utf8.DecodeRuneInString(function.Name.Name[len("Test"):])
	if unicode.IsLower(next) || function.Type.TypeParams != nil || function.Type.Params == nil || len(function.Type.Params.List) != 1 || function.Type.Results != nil && len(function.Type.Results.List) != 0 {
		return false
	}
	parameter := function.Type.Params.List[0]
	if len(parameter.Names) != 1 {
		return false
	}
	pointer, ok := parameter.Type.(*ast.StarExpr)
	if !ok {
		return false
	}
	selector, ok := pointer.X.(*ast.SelectorExpr)
	if !ok || selector.Sel.Name != "T" {
		return false
	}
	packageName, ok := selector.X.(*ast.Ident)
	if !ok {
		return false
	}
	_, ok = testingAliases[packageName.Name]
	return ok
}

func staticValue(expression ast.Expr) (constant.Value, bool) {
	switch value := expression.(type) {
	case *ast.Ident:
		if value.Name == "true" {
			return constant.MakeBool(true), true
		}
		if value.Name == "false" {
			return constant.MakeBool(false), true
		}
	case *ast.BasicLit:
		result := constant.MakeFromLiteral(value.Value, value.Kind, 0)
		return result, result.Kind() != constant.Unknown
	case *ast.ParenExpr:
		return staticValue(value.X)
	case *ast.UnaryExpr:
		operand, known := staticValue(value.X)
		if !known {
			return nil, false
		}
		if value.Op == token.NOT && operand.Kind() == constant.Bool {
			return constant.MakeBool(!constant.BoolVal(operand)), true
		}
		if value.Op == token.ADD || value.Op == token.SUB || value.Op == token.XOR {
			return constant.UnaryOp(value.Op, operand, 0), true
		}
	case *ast.BinaryExpr:
		left, leftKnown := staticValue(value.X)
		if leftKnown && left.Kind() == constant.Bool {
			if value.Op == token.LAND && !constant.BoolVal(left) {
				return constant.MakeBool(false), true
			}
			if value.Op == token.LOR && constant.BoolVal(left) {
				return constant.MakeBool(true), true
			}
		}
		right, rightKnown := staticValue(value.Y)
		if !leftKnown || !rightKnown {
			return nil, false
		}
		if value.Op == token.LAND || value.Op == token.LOR {
			if left.Kind() != constant.Bool || right.Kind() != constant.Bool {
				return nil, false
			}
			if value.Op == token.LAND {
				return constant.MakeBool(constant.BoolVal(left) && constant.BoolVal(right)), true
			}
			return constant.MakeBool(constant.BoolVal(left) || constant.BoolVal(right)), true
		}
		if value.Op == token.EQL || value.Op == token.NEQ || value.Op == token.LSS || value.Op == token.LEQ || value.Op == token.GTR || value.Op == token.GEQ {
			return constant.MakeBool(constant.Compare(left, value.Op, right)), true
		}
	}
	return nil, false
}

func staticBool(expression ast.Expr) (bool, bool) {
	value, known := staticValue(expression)
	if !known || value.Kind() != constant.Bool {
		return false, false
	}
	return constant.BoolVal(value), true
}

func inspectReachableExpression(expression ast.Expr, markers *[]string) {
	ast.Inspect(expression, func(node ast.Node) bool {
		if node == nil {
			return true
		}
		if _, nested := node.(*ast.FuncLit); nested {
			return false
		}
		if binary, ok := node.(*ast.BinaryExpr); ok && (binary.Op == token.LAND || binary.Op == token.LOR) {
			inspectReachableExpression(binary.X, markers)
			left, known := staticBool(binary.X)
			if !known || binary.Op == token.LAND && left || binary.Op == token.LOR && !left {
				inspectReachableExpression(binary.Y, markers)
			}
			return false
		}
		call, ok := node.(*ast.CallExpr)
		if !ok || len(call.Args) != 2 {
			return true
		}
		name, ok := call.Fun.(*ast.Ident)
		if !ok || name.Name != "flowAssert" {
			return true
		}
		literal, ok := call.Args[1].(*ast.BasicLit)
		if !ok || literal.Kind != token.STRING {
			return true
		}
		marker, err := strconv.Unquote(literal.Value)
		if err == nil {
			*markers = append(*markers, marker)
		}
		return true
	})
}

func inspectReachableNode(node ast.Node, markers *[]string) {
	ast.Inspect(node, func(current ast.Node) bool {
		if current == nil {
			return true
		}
		if _, nested := current.(*ast.FuncLit); nested {
			return false
		}
		if expression, ok := current.(ast.Expr); ok {
			inspectReachableExpression(expression, markers)
			return false
		}
		return true
	})
}

func directPanic(expression ast.Expr) bool {
	call, ok := expression.(*ast.CallExpr)
	if !ok {
		return false
	}
	name, ok := call.Fun.(*ast.Ident)
	return ok && name.Name == "panic"
}

func directTerminalTestCall(expression ast.Expr, testParameter string) bool {
	call, ok := expression.(*ast.CallExpr)
	if !ok {
		return false
	}
	selector, ok := call.Fun.(*ast.SelectorExpr)
	if !ok {
		return false
	}
	receiver, ok := selector.X.(*ast.Ident)
	if !ok || receiver.Name != testParameter {
		return false
	}
	switch selector.Sel.Name {
	case "Fatal", "Fatalf", "FailNow", "Skip", "Skipf", "SkipNow":
		return true
	default:
		return false
	}
}

func reachableGoStatement(statement ast.Stmt, markers *[]string, testParameter string) bool {
	switch value := statement.(type) {
	case *ast.BlockStmt:
		return reachableGoStatements(value.List, markers, testParameter)
	case *ast.ExprStmt:
		inspectReachableExpression(value.X, markers)
		return !directPanic(value.X) && !directTerminalTestCall(value.X, testParameter)
	case *ast.DeclStmt, *ast.AssignStmt, *ast.IncDecStmt:
		inspectReachableNode(statement, markers)
		return true
	case *ast.ReturnStmt:
		for _, result := range value.Results {
			inspectReachableExpression(result, markers)
		}
		return false
	case *ast.BranchStmt:
		return false
	case *ast.EmptyStmt:
		return true
	case *ast.IfStmt:
		if value.Init != nil && !reachableGoStatement(value.Init, markers, testParameter) {
			return false
		}
		inspectReachableExpression(value.Cond, markers)
		condition, known := staticBool(value.Cond)
		if known {
			if condition {
				return reachableGoStatement(value.Body, markers, testParameter)
			}
			if value.Else == nil {
				return true
			}
			return reachableGoStatement(value.Else, markers, testParameter)
		}
		thenContinues := reachableGoStatement(value.Body, markers, testParameter)
		elseContinues := true
		if value.Else != nil {
			elseContinues = reachableGoStatement(value.Else, markers, testParameter)
		}
		return thenContinues || elseContinues
	default:
		// Loops, switches, selects, labels, goroutines, and defers need path-sensitive
		// semantics. Stop the proof here rather than accepting an assertion they may block.
		return false
	}
}

func reachableGoStatements(statements []ast.Stmt, markers *[]string, testParameter string) bool {
	for _, statement := range statements {
		if !reachableGoStatement(statement, markers, testParameter) {
			return false
		}
	}
	return true
}

func directFlowAssertions(body *ast.BlockStmt, testParameter string) []string {
	markers := []string{}
	reachableGoStatements(body.List, &markers, testParameter)
	sort.Strings(markers)
	return markers
}

func declarations(file *ast.File) []declarationRecord {
	result := []declarationRecord{}
	for _, declaration := range file.Decls {
		switch value := declaration.(type) {
		case *ast.FuncDecl:
			if value.Recv == nil {
				result = append(result, declarationRecord{Name: value.Name.Name, Kind: "func"})
			}
		case *ast.GenDecl:
			kind := value.Tok.String()
			for _, specification := range value.Specs {
				switch spec := specification.(type) {
				case *ast.TypeSpec:
					result = append(result, declarationRecord{Name: spec.Name.Name, Kind: "type"})
				case *ast.ValueSpec:
					for _, name := range spec.Names {
						result = append(result, declarationRecord{Name: name.Name, Kind: kind})
					}
				}
			}
		}
	}
	sort.Slice(result, func(left, right int) bool {
		if result[left].Name == result[right].Name {
			return result[left].Kind < result[right].Kind
		}
		return result[left].Name < result[right].Name
	})
	return result
}

func buildTagEnabled(tag string) bool {
	if tag == build.Default.GOOS || tag == build.Default.GOARCH || tag == build.Default.Compiler {
		return true
	}
	if tag == "cgo" {
		return build.Default.CgoEnabled
	}
	if tag == "unix" {
		switch build.Default.GOOS {
		case "aix", "android", "darwin", "dragonfly", "freebsd", "hurd", "illumos", "ios", "linux", "netbsd", "openbsd", "solaris":
			return true
		}
	}
	for _, configured := range append(append(append([]string{}, build.Default.BuildTags...), build.Default.ToolTags...), build.Default.ReleaseTags...) {
		if tag == configured {
			return true
		}
	}
	return false
}

var knownGOOS = map[string]struct{}{
	"aix": {}, "android": {}, "darwin": {}, "dragonfly": {}, "freebsd": {}, "hurd": {},
	"illumos": {}, "ios": {}, "js": {}, "linux": {}, "nacl": {}, "netbsd": {},
	"openbsd": {}, "plan9": {}, "solaris": {}, "wasip1": {}, "windows": {}, "zos": {},
}

var knownGOARCH = map[string]struct{}{
	"386": {}, "amd64": {}, "amd64p32": {}, "arm": {}, "armbe": {}, "arm64": {},
	"arm64be": {}, "loong64": {}, "mips": {}, "mipsle": {}, "mips64": {},
	"mips64le": {}, "mips64p32": {}, "mips64p32le": {}, "ppc": {}, "ppc64": {},
	"ppc64le": {}, "riscv": {}, "riscv64": {}, "s390": {}, "s390x": {}, "sparc": {},
	"sparc64": {}, "wasm": {},
}

func filenameBuildEnabled(filePath string) bool {
	name := strings.TrimSuffix(filepath.Base(filePath), filepath.Ext(filePath))
	name = strings.TrimSuffix(name, "_test")
	parts := strings.Split(name, "_")
	if len(parts) < 2 {
		return true
	}
	last := parts[len(parts)-1]
	if _, isOS := knownGOOS[last]; isOS {
		return last == build.Default.GOOS
	}
	if _, isArch := knownGOARCH[last]; isArch {
		if last != build.Default.GOARCH {
			return false
		}
		if len(parts) >= 3 {
			candidateOS := parts[len(parts)-2]
			if _, isOS := knownGOOS[candidateOS]; isOS {
				return candidateOS == build.Default.GOOS
			}
		}
	}
	return true
}

func sourceBuildEnabled(filePath string, source any) bool {
	if !filenameBuildEnabled(filePath) {
		return false
	}
	var text string
	switch value := source.(type) {
	case []byte:
		text = string(value)
	case string:
		text = value
	default:
		return true
	}
	legacyExpressions := []constraint.Expr{}
	for _, line := range strings.Split(text, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "package ") {
			break
		}
		if strings.HasPrefix(trimmed, "//go:build ") {
			expression, err := constraint.Parse(trimmed)
			return err == nil && expression.Eval(buildTagEnabled)
		}
		if strings.HasPrefix(trimmed, "// +build ") {
			expression, err := constraint.Parse(trimmed)
			if err != nil {
				return false
			}
			legacyExpressions = append(legacyExpressions, expression)
		}
	}
	for _, expression := range legacyExpressions {
		if !expression.Eval(buildTagEnabled) {
			return false
		}
	}
	return true
}

func analyzeSource(filePath string, source any) (fileRecord, error) {
	if !sourceBuildEnabled(filePath, source) {
		return fileRecord{Path: filepath.ToSlash(filePath), Declarations: []declarationRecord{}, Tests: []testRecord{}}, nil
	}
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, filePath, source, parser.SkipObjectResolution|parser.AllErrors)
	if err != nil {
		return fileRecord{}, err
	}
	tests := []testRecord{}
	if !strings.HasSuffix(filepath.Base(filePath), "_test.go") {
		return fileRecord{Path: filepath.ToSlash(filePath), Declarations: declarations(file), Tests: tests}, nil
	}
	testingAliases := testingImportAliases(file)
	for _, declaration := range file.Decls {
		function, ok := declaration.(*ast.FuncDecl)
		if !ok || !testFunction(function, testingAliases) {
			continue
		}
		testParameter := function.Type.Params.List[0].Names[0].Name
		tests = append(tests, testRecord{
			Name:           function.Name.Name,
			FlowAssertions: directFlowAssertions(function.Body, testParameter),
		})
	}
	sort.Slice(tests, func(left, right int) bool { return tests[left].Name < tests[right].Name })
	return fileRecord{Path: filepath.ToSlash(filePath), Declarations: declarations(file), Tests: tests}, nil
}

func pathsUnderRoot(root string, requested []string) ([]string, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	if len(requested) == 0 {
		paths := []string{}
		err := filepath.WalkDir(root, func(filePath string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".go") {
				matched, matchErr := build.Default.MatchFile(filepath.Dir(filePath), entry.Name())
				if matchErr != nil {
					return matchErr
				}
				if matched {
					paths = append(paths, filePath)
				}
			}
			return nil
		})
		sort.Strings(paths)
		return paths, err
	}
	paths := make([]string, 0, len(requested))
	for _, relative := range requested {
		candidate := filepath.Join(root, filepath.FromSlash(relative))
		resolved, err := filepath.Abs(candidate)
		if err != nil {
			return nil, err
		}
		within, err := filepath.Rel(root, resolved)
		if err != nil || within == ".." || strings.HasPrefix(within, ".."+string(filepath.Separator)) {
			return nil, fmt.Errorf("file escapes inventory root: %s", relative)
		}
		matched, err := build.Default.MatchFile(filepath.Dir(resolved), filepath.Base(resolved))
		if err != nil {
			return nil, err
		}
		if matched {
			paths = append(paths, resolved)
		}
	}
	sort.Strings(paths)
	return paths, nil
}

func buildInventory(root string, requested []string) (inventory, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return inventory{}, err
	}
	paths, err := pathsUnderRoot(root, requested)
	if err != nil {
		return inventory{}, err
	}
	files := make([]fileRecord, 0, len(paths))
	for _, filePath := range paths {
		record, err := analyzeSource(filePath, nil)
		if err != nil {
			return inventory{}, fmt.Errorf("parse %s: %w", filePath, err)
		}
		relative, err := filepath.Rel(root, filePath)
		if err != nil {
			return inventory{}, err
		}
		record.Path = filepath.ToSlash(relative)
		files = append(files, record)
	}
	return inventory{SchemaVersion: schemaVersion, Files: files}, nil
}

func run(arguments []string, stdin io.Reader, stdout io.Writer) error {
	flags := flag.NewFlagSet("flow-symbol-inventory", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	root := flags.String("root", ".", "root used to resolve --file paths")
	stdinPath := flags.String("stdin-path", "", "parse one virtual Go file from stdin")
	var files stringFlags
	flags.Var(&files, "file", "root-relative Go file to parse; repeatable")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	var result inventory
	if *stdinPath != "" {
		if len(files) != 0 {
			return fmt.Errorf("--stdin-path cannot be combined with --file")
		}
		source, err := io.ReadAll(stdin)
		if err != nil {
			return err
		}
		record, err := analyzeSource(*stdinPath, source)
		if err != nil {
			return fmt.Errorf("parse %s: %w", *stdinPath, err)
		}
		result = inventory{SchemaVersion: schemaVersion, Files: []fileRecord{record}}
	} else {
		var err error
		result, err = buildInventory(*root, files)
		if err != nil {
			return err
		}
	}
	encoder := json.NewEncoder(stdout)
	encoder.SetEscapeHTML(false)
	return encoder.Encode(result)
}

func main() {
	if err := run(os.Args[1:], os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
