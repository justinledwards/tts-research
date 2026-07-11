package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"go/ast"
	"go/build"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

var routeMethods = map[string]struct{}{
	"Add": {}, "All": {}, "Connect": {}, "Delete": {}, "Get": {}, "Head": {},
	"Options": {}, "Patch": {}, "Post": {}, "Put": {}, "Trace": {},
}

var unsupportedRegistrationMethods = map[string]struct{}{
	"Mount": {}, "Route": {}, "Static": {},
}

type routeRecord struct {
	Method string `json:"method"`
	Path   string `json:"path"`
	File   string `json:"file"`
	Line   int    `json:"line"`
}

type inventory struct {
	SchemaVersion string        `json:"schemaVersion"`
	SourceFiles   int           `json:"sourceFiles"`
	Routes        []routeRecord `json:"routes"`
}

type functionInfo struct {
	decl              *ast.FuncDecl
	id                string
	file              string
	routeParamIndexes map[int]string
	returnsRouter     bool
	resultCount       int
	captured          map[string]receiverValue
}

type receiverValue struct {
	prefix   string
	known    bool
	callable *callableBinding
}

type callableBinding struct {
	info    *functionInfo
	literal *ast.FuncLit
}

type functionResult struct {
	receiver receiverValue
	routes   map[string]int
}

type executionState struct {
	environment map[string]receiverValue
	routes      map[string]int
}

type packageAnalyzer struct {
	fset         *token.FileSet
	functions    map[string]*functionInfo
	methods      map[string][]*functionInfo
	routes       []routeRecord
	routeRecords map[string]routeRecord
	invoked      map[string]bool
	active       map[string]bool
	results      map[string]functionResult
}

func expressionText(fset *token.FileSet, expression ast.Expr) string {
	if expression == nil {
		return "<nil>"
	}
	return fmt.Sprintf("%T@%s", expression, fset.Position(expression.Pos()))
}

func importAliases(file *ast.File) map[string]struct{} {
	aliases := map[string]struct{}{}
	for _, imported := range file.Imports {
		pathValue, err := strconv.Unquote(imported.Path.Value)
		if err != nil || !strings.Contains(pathValue, "gofiber/fiber") {
			continue
		}
		alias := "fiber"
		if imported.Name != nil && imported.Name.Name != "_" && imported.Name.Name != "." {
			alias = imported.Name.Name
		}
		aliases[alias] = struct{}{}
	}
	return aliases
}

func fiberTypeName(expression ast.Expr, aliases map[string]struct{}) (string, bool) {
	if pointer, ok := expression.(*ast.StarExpr); ok {
		expression = pointer.X
	}
	selector, ok := expression.(*ast.SelectorExpr)
	if !ok {
		return "", false
	}
	packageName, ok := selector.X.(*ast.Ident)
	if !ok {
		return "", false
	}
	if _, ok := aliases[packageName.Name]; !ok {
		return "", false
	}
	return selector.Sel.Name, true
}

func flattenedFields(fields *ast.FieldList) []struct {
	name           string
	typeExpression ast.Expr
} {
	result := []struct {
		name           string
		typeExpression ast.Expr
	}{}
	if fields == nil {
		return result
	}
	for _, field := range fields.List {
		if len(field.Names) == 0 {
			result = append(result, struct {
				name           string
				typeExpression ast.Expr
			}{"", field.Type})
			continue
		}
		for _, name := range field.Names {
			result = append(result, struct {
				name           string
				typeExpression ast.Expr
			}{name.Name, field.Type})
		}
	}
	return result
}

func parseFunctions(root string) (*token.FileSet, map[string]*functionInfo, map[string][]*functionInfo, error) {
	fset := token.NewFileSet()
	functions := map[string]*functionInfo{}
	methods := map[string][]*functionInfo{}
	err := filepath.WalkDir(root, func(filePath string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") || strings.HasSuffix(entry.Name(), "_test.go") {
			return nil
		}
		matches, err := build.Default.MatchFile(filepath.Dir(filePath), entry.Name())
		if err != nil {
			return err
		}
		if !matches {
			return nil
		}
		file, err := parser.ParseFile(fset, filePath, nil, parser.SkipObjectResolution)
		if err != nil {
			return err
		}
		aliases := importAliases(file)
		for _, declaration := range file.Decls {
			function, ok := declaration.(*ast.FuncDecl)
			if !ok || function.Body == nil {
				continue
			}
			if function.Recv == nil {
				if _, duplicate := functions[function.Name.Name]; duplicate {
					return fmt.Errorf("duplicate package function name unsupported: %s", function.Name.Name)
				}
			}
			id := function.Name.Name
			if function.Recv != nil {
				id = fmt.Sprintf("method:%s@%d", function.Name.Name, function.Pos())
			}
			if _, duplicate := functions[id]; duplicate {
				return fmt.Errorf("duplicate package function name unsupported: %s", function.Name.Name)
			}
			info := &functionInfo{
				decl:              function,
				id:                id,
				file:              filePath,
				routeParamIndexes: map[int]string{},
			}
			for index, parameter := range flattenedFields(function.Type.Params) {
				typeName, isFiber := fiberTypeName(parameter.typeExpression, aliases)
				if isFiber && (typeName == "App" || typeName == "Router") && parameter.name != "" {
					info.routeParamIndexes[index] = parameter.name
				}
			}
			results := flattenedFields(function.Type.Results)
			info.resultCount = len(results)
			for _, result := range results {
				typeName, isFiber := fiberTypeName(result.typeExpression, aliases)
				if isFiber && (typeName == "App" || typeName == "Router") {
					info.returnsRouter = true
				}
			}
			functions[id] = info
			if function.Recv != nil {
				methods[function.Name.Name] = append(methods[function.Name.Name], info)
			}
		}
		return nil
	})
	return fset, functions, methods, err
}

func invocationKey(name string, arguments map[int]receiverValue) string {
	indexes := make([]int, 0, len(arguments))
	for index := range arguments {
		indexes = append(indexes, index)
	}
	sort.Ints(indexes)
	parts := []string{name}
	for _, index := range indexes {
		parts = append(parts, fmt.Sprintf("%d=%s", index, arguments[index].prefix))
	}
	return strings.Join(parts, "|")
}

func joinPrefix(prefix string, routePath string) string {
	if prefix == "" || prefix == "/" {
		return routePath
	}
	return strings.TrimRight(prefix, "/") + "/" + strings.TrimLeft(routePath, "/")
}

func literalString(expression ast.Expr) (string, bool) {
	literal, ok := expression.(*ast.BasicLit)
	if !ok || literal.Kind != token.STRING {
		return "", false
	}
	value, err := strconv.Unquote(literal.Value)
	return value, err == nil
}

func (analyzer *packageAnalyzer) receiverParameters(info *functionInfo, arguments map[int]receiverValue) (map[string]receiverValue, error) {
	environment := map[string]receiverValue{}
	for index, name := range info.routeParamIndexes {
		value, ok := arguments[index]
		if !ok || !value.known {
			return nil, fmt.Errorf("unresolved Fiber receiver argument %s[%d]", info.decl.Name.Name, index)
		}
		environment[name] = value
	}
	return environment, nil
}

func (analyzer *packageAnalyzer) evaluateReceiver(expression ast.Expr, environment map[string]receiverValue, current string) (receiverValue, error) {
	switch value := expression.(type) {
	case *ast.Ident:
		if receiver, ok := environment[value.Name]; ok {
			return receiver, nil
		}
		if info := analyzer.functions[value.Name]; info != nil {
			return receiverValue{callable: &callableBinding{info: info}}, nil
		}
	case *ast.FuncLit:
		return receiverValue{callable: &callableBinding{literal: value}}, nil
	case *ast.ParenExpr:
		return analyzer.evaluateReceiver(value.X, environment, current)
	case *ast.IndexExpr:
		return analyzer.evaluateReceiver(value.X, environment, current)
	case *ast.IndexListExpr:
		return analyzer.evaluateReceiver(value.X, environment, current)
	case *ast.SelectorExpr:
		candidates := analyzer.routeMethodCandidates(value.Sel.Name)
		if len(candidates) > 1 {
			return receiverValue{}, fmt.Errorf("ambiguous invoked receiver method %s at %s", value.Sel.Name, analyzer.fset.Position(value.Pos()))
		}
		if len(candidates) == 1 {
			return receiverValue{callable: &callableBinding{info: candidates[0]}}, nil
		}
	case *ast.CallExpr:
		if selector, ok := value.Fun.(*ast.SelectorExpr); ok {
			if packageName, ok := selector.X.(*ast.Ident); ok && packageName.Name == "fiber" && selector.Sel.Name == "New" {
				return receiverValue{prefix: "", known: true}, nil
			}
			if selector.Sel.Name == "Group" {
				parent, err := analyzer.evaluateReceiver(selector.X, environment, current)
				if err != nil {
					return receiverValue{}, err
				}
				if !parent.known || len(value.Args) == 0 {
					return receiverValue{}, fmt.Errorf("unresolved Fiber group receiver at %s", analyzer.fset.Position(value.Pos()))
				}
				groupPath, ok := literalString(value.Args[0])
				if !ok {
					return receiverValue{}, fmt.Errorf("computed group prefix at %s", analyzer.fset.Position(value.Args[0].Pos()))
				}
				return receiverValue{prefix: joinPrefix(parent.prefix, groupPath), known: true}, nil
			}
		}
		if binding, err := analyzer.evaluateReceiver(value.Fun, environment, current); err != nil {
			return receiverValue{}, err
		} else if binding.callable != nil && binding.callable.info != nil {
			info := binding.callable.info
			if info == nil || !info.returnsRouter {
				return receiverValue{}, nil
			}
			if info.resultCount != 1 {
				return receiverValue{}, fmt.Errorf("unsupported multi-result Fiber receiver call to %s", info.decl.Name.Name)
			}
			arguments, err := analyzer.callArguments(info, value, environment, current)
			if err != nil {
				return receiverValue{}, err
			}
			result, err := analyzer.analyzeFunction(info, arguments)
			return result.receiver, err
		}
	}
	return receiverValue{}, nil
}

func (analyzer *packageAnalyzer) routeMethodCandidates(name string) []*functionInfo {
	matched := []*functionInfo{}
	for _, candidate := range analyzer.methods[name] {
		if len(candidate.routeParamIndexes) > 0 {
			matched = append(matched, candidate)
		}
	}
	return matched
}

func (analyzer *packageAnalyzer) callArguments(info *functionInfo, call *ast.CallExpr, environment map[string]receiverValue, current string) (map[int]receiverValue, error) {
	arguments := map[int]receiverValue{}
	for index := range info.routeParamIndexes {
		if index >= len(call.Args) {
			return nil, fmt.Errorf("missing Fiber receiver argument calling %s from %s", info.decl.Name.Name, current)
		}
		value, err := analyzer.evaluateReceiver(call.Args[index], environment, current)
		if err != nil {
			return nil, err
		}
		if !value.known {
			return nil, fmt.Errorf("unresolved Fiber receiver argument calling %s from %s", info.decl.Name.Name, current)
		}
		arguments[index] = value
	}
	return arguments, nil
}

func (analyzer *packageAnalyzer) assignReceivers(left []ast.Expr, right []ast.Expr, environment map[string]receiverValue, current string) error {
	if len(left) != len(right) {
		receiverAffecting := false
		for _, expression := range left {
			if identifier, ok := expression.(*ast.Ident); ok {
				_, receiverAffecting = environment[identifier.Name]
				if receiverAffecting {
					break
				}
			}
		}
		for _, expression := range right {
			receiver, err := analyzer.evaluateReceiver(expression, environment, current)
			if err != nil {
				return err
			}
			receiverAffecting = receiverAffecting || receiver.known
		}
		if receiverAffecting {
			return fmt.Errorf("unsupported tuple or multi-result Fiber receiver assignment in %s", current)
		}
		return nil
	}

	type update struct {
		name  string
		value receiverValue
	}
	updates := make([]update, 0, len(right))
	for index, expression := range right {
		receiver, err := analyzer.evaluateReceiver(expression, environment, current)
		if err != nil {
			return err
		}
		identifier, identifierAssignment := left[index].(*ast.Ident)
		if !identifierAssignment {
			if receiver.known {
				return fmt.Errorf("unsupported Fiber receiver assignment target at %s", analyzer.fset.Position(left[index].Pos()))
			}
			continue
		}
		updates = append(updates, update{name: identifier.Name, value: receiver})
	}
	for _, pending := range updates {
		if pending.value.known || pending.value.callable != nil {
			environment[pending.name] = pending.value
		} else {
			delete(environment, pending.name)
		}
	}
	return nil
}

func (analyzer *packageAnalyzer) analyzeCall(call *ast.CallExpr, state *executionState, current string, routePrefixes map[token.Pos]string) error {
	environment := state.environment
	if selector, ok := call.Fun.(*ast.SelectorExpr); ok {
		method := selector.Sel.Name
		if _, unsupported := unsupportedRegistrationMethods[method]; unsupported {
			if receiver, _ := analyzer.evaluateReceiver(selector.X, environment, current); receiver.known {
				return fmt.Errorf("unsupported Fiber registration form %s at %s", method, analyzer.fset.Position(call.Pos()))
			}
		}
		if _, routeMethod := routeMethods[method]; routeMethod {
			receiver, err := analyzer.evaluateReceiver(selector.X, environment, current)
			if err != nil {
				return err
			}
			if !receiver.known {
				return fmt.Errorf("unclassified Fiber route receiver for %s at %s", method, expressionText(analyzer.fset, selector.X))
			}
			if len(call.Args) == 0 {
				return fmt.Errorf("route registration missing path at %s", analyzer.fset.Position(call.Pos()))
			}
			routePath, ok := literalString(call.Args[0])
			if !ok {
				return fmt.Errorf("computed route path at %s", analyzer.fset.Position(call.Args[0].Pos()))
			}
			if prior, found := routePrefixes[call.Pos()]; found {
				if prior != receiver.prefix {
					return fmt.Errorf("ambiguous Fiber route receiver prefixes at %s", analyzer.fset.Position(call.Pos()))
				}
			}
			routePrefixes[call.Pos()] = receiver.prefix
			position := analyzer.fset.Position(call.Pos())
			record := routeRecord{
				Method: strings.ToUpper(method),
				Path:   joinPrefix(receiver.prefix, routePath),
				File:   position.Filename,
				Line:   position.Line,
			}
			return analyzer.addRouteOccurrences(state, map[string]int{record.Method + " " + record.Path: 1}, map[string]routeRecord{record.Method + " " + record.Path: record})
		}
		matched := analyzer.routeMethodCandidates(method)
		if len(matched) > 1 {
			return fmt.Errorf("ambiguous invoked receiver method %s at %s", method, analyzer.fset.Position(call.Pos()))
		}
		if len(matched) == 1 {
			arguments, err := analyzer.callArguments(matched[0], call, environment, current)
			if err != nil {
				return err
			}
			result, err := analyzer.analyzeFunction(matched[0], arguments)
			if err != nil {
				return err
			}
			return analyzer.addRouteOccurrences(state, result.routes, nil)
		}
	}
	binding, err := analyzer.evaluateReceiver(call.Fun, environment, current)
	if err != nil {
		return err
	}
	if binding.callable == nil {
		return nil
	}
	if binding.callable.literal != nil {
		literal := binding.callable.literal
		fields := flattenedFields(literal.Type.Params)
		literalInfo := &functionInfo{
			decl: &ast.FuncDecl{
				Name: ast.NewIdent(fmt.Sprintf("literal@%d", literal.Pos())),
				Type: literal.Type,
				Body: literal.Body,
			},
			id:                fmt.Sprintf("literal@%d:%s", literal.Pos(), environmentKey(environment)),
			routeParamIndexes: map[int]string{},
			resultCount:       len(flattenedFields(literal.Type.Results)),
			captured:          cloneEnvironment(environment),
		}
		arguments := map[int]receiverValue{}
		for index, field := range fields {
			if index >= len(call.Args) || field.name == "" {
				continue
			}
			receiver, err := analyzer.evaluateReceiver(call.Args[index], environment, current)
			if err != nil {
				return err
			}
			if receiver.known {
				literalInfo.routeParamIndexes[index] = field.name
				arguments[index] = receiver
			}
		}
		result, err := analyzer.analyzeFunction(literalInfo, arguments)
		if err != nil {
			return err
		}
		return analyzer.addRouteOccurrences(state, result.routes, nil)
	}
	info := binding.callable.info
	if info == nil || len(info.routeParamIndexes) == 0 {
		return nil
	}
	arguments, err := analyzer.callArguments(info, call, environment, current)
	if err != nil {
		return err
	}
	result, err := analyzer.analyzeFunction(info, arguments)
	if err != nil {
		return err
	}
	return analyzer.addRouteOccurrences(state, result.routes, nil)
}

func (analyzer *packageAnalyzer) addRouteOccurrences(state *executionState, additions map[string]int, records map[string]routeRecord) error {
	for key, count := range additions {
		if state.routes[key]+count > 1 {
			return fmt.Errorf("duplicate route registration %s", key)
		}
		state.routes[key] += count
		if record, ok := records[key]; ok {
			if _, exists := analyzer.routeRecords[key]; !exists {
				analyzer.routeRecords[key] = record
				analyzer.routes = append(analyzer.routes, record)
			}
		}
	}
	return nil
}

func cloneEnvironment(environment map[string]receiverValue) map[string]receiverValue {
	clone := map[string]receiverValue{}
	for name, value := range environment {
		clone[name] = value
	}
	return clone
}

func cloneRoutes(routes map[string]int) map[string]int {
	clone := map[string]int{}
	for name, count := range routes {
		clone[name] = count
	}
	return clone
}

func cloneState(state executionState) executionState {
	return executionState{environment: cloneEnvironment(state.environment), routes: cloneRoutes(state.routes)}
}

func environmentKey(environment map[string]receiverValue) string {
	names := make([]string, 0, len(environment))
	for name := range environment {
		names = append(names, name)
	}
	sort.Strings(names)
	parts := make([]string, 0, len(names))
	for _, name := range names {
		value := environment[name]
		callableID := ""
		if value.callable != nil && value.callable.literal != nil {
			callableID = fmt.Sprintf("literal@%d", value.callable.literal.Pos())
		} else if value.callable != nil && value.callable.info != nil {
			callableID = value.callable.info.id
		}
		parts = append(parts, fmt.Sprintf("%s=%s:%s", name, value.prefix, callableID))
	}
	return strings.Join(parts, "|")
}

func stateKey(state executionState) string {
	keys := make([]string, 0, len(state.routes))
	for key := range state.routes {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := []string{environmentKey(state.environment)}
	for _, key := range keys {
		parts = append(parts, fmt.Sprintf("%s=%d", key, state.routes[key]))
	}
	return strings.Join(parts, "|")
}

func uniqueStates(states []executionState) []executionState {
	unique := make([]executionState, 0, len(states))
	seen := map[string]bool{}
	for _, state := range states {
		key := stateKey(state)
		if !seen[key] {
			seen[key] = true
			unique = append(unique, state)
		}
	}
	return unique
}

func lexicalDeclarations(statements []ast.Stmt) []string {
	names := map[string]bool{}
	for _, statement := range statements {
		switch value := statement.(type) {
		case *ast.AssignStmt:
			if value.Tok == token.DEFINE {
				for _, expression := range value.Lhs {
					if identifier, ok := expression.(*ast.Ident); ok && identifier.Name != "_" {
						names[identifier.Name] = true
					}
				}
			}
		case *ast.DeclStmt:
			if declaration, ok := value.Decl.(*ast.GenDecl); ok && declaration.Tok == token.VAR {
				for _, specification := range declaration.Specs {
					if variable, ok := specification.(*ast.ValueSpec); ok {
						for _, name := range variable.Names {
							names[name.Name] = true
						}
					}
				}
			}
		}
	}
	result := make([]string, 0, len(names))
	for name := range names {
		result = append(result, name)
	}
	return result
}

func restoreLexicalBindings(environments []map[string]receiverValue, outer map[string]receiverValue, names []string) {
	for _, environment := range environments {
		for _, name := range names {
			if binding, found := outer[name]; found {
				environment[name] = binding
			} else {
				delete(environment, name)
			}
		}
	}
}

func staticBool(expression ast.Expr) (bool, bool) {
	identifier, ok := expression.(*ast.Ident)
	if !ok || (identifier.Name != "true" && identifier.Name != "false") {
		return false, false
	}
	return identifier.Name == "true", true
}

func staticRangeCount(expression ast.Expr) (int, bool) {
	literal, ok := expression.(*ast.CompositeLit)
	if !ok {
		return 0, false
	}
	return len(literal.Elts), true
}

func restoreStateBindings(states []executionState, outer map[string]receiverValue, names []string) {
	for index := range states {
		for _, name := range names {
			if binding, found := outer[name]; found {
				states[index].environment[name] = binding
			} else {
				delete(states[index].environment, name)
			}
		}
	}
}

func routeCount(routes map[string]int) int {
	total := 0
	for _, count := range routes {
		total += count
	}
	return total
}

func (analyzer *packageAnalyzer) analyzeFunction(info *functionInfo, arguments map[int]receiverValue) (functionResult, error) {
	key := invocationKey(info.id, arguments)
	if result, ok := analyzer.results[key]; ok {
		return functionResult{receiver: result.receiver, routes: cloneRoutes(result.routes)}, nil
	}
	if analyzer.active[key] {
		return functionResult{}, fmt.Errorf("recursive Fiber route helper invocation: %s", key)
	}
	if info.returnsRouter && info.resultCount != 1 {
		return functionResult{}, fmt.Errorf("unsupported multi-result Fiber receiver call to %s", info.decl.Name.Name)
	}
	environment := cloneEnvironment(info.captured)
	parameters, err := analyzer.receiverParameters(info, arguments)
	if err != nil {
		return functionResult{}, err
	}
	for name, value := range parameters {
		environment[name] = value
	}
	analyzer.invoked[info.id] = true
	analyzer.active[key] = true
	defer delete(analyzer.active, key)

	returns := []receiverValue{}
	completed := []executionState{}
	routePrefixes := map[token.Pos]string{}
	routeExecutions := 0
	var walkStatements func([]ast.Stmt, []executionState) ([]executionState, error)
	var walkStatement func(ast.Stmt, executionState) ([]executionState, error)
	var walkBlock func(*ast.BlockStmt, executionState) ([]executionState, error)
	var walkLoop func(*ast.BlockStmt, ast.Stmt, []executionState, bool, string) ([]executionState, error)

	walkExpression := func(expression ast.Expr, state *executionState) error {
		var traversalError error
		ast.Inspect(expression, func(node ast.Node) bool {
			if traversalError != nil {
				return false
			}
			if _, literal := node.(*ast.FuncLit); literal {
				return false
			}
			if call, ok := node.(*ast.CallExpr); ok {
				before := routeCount(state.routes)
				traversalError = analyzer.analyzeCall(call, state, info.decl.Name.Name, routePrefixes)
				routeExecutions += routeCount(state.routes) - before
			}
			return traversalError == nil
		})
		return traversalError
	}

	walkStatements = func(statements []ast.Stmt, states []executionState) ([]executionState, error) {
		current := states
		for _, statement := range statements {
			next := []executionState{}
			for _, state := range current {
				continuations, err := walkStatement(statement, state)
				if err != nil {
					return nil, err
				}
				next = append(next, continuations...)
			}
			current = uniqueStates(next)
			if len(current) == 0 {
				break
			}
		}
		return current, nil
	}

	walkBlock = func(block *ast.BlockStmt, state executionState) ([]executionState, error) {
		continuations, err := walkStatements(block.List, []executionState{cloneState(state)})
		if err != nil {
			return nil, err
		}
		restoreStateBindings(continuations, state.environment, lexicalDeclarations(block.List))
		return continuations, nil
	}

	walkLoop = func(body *ast.BlockStmt, post ast.Stmt, entries []executionState, mayExit bool, kind string) ([]executionState, error) {
		const maxReceiverLoopStates = 64
		entries = uniqueStates(entries)
		continuations := []executionState{}
		if mayExit {
			for _, entry := range entries {
				continuations = append(continuations, cloneState(entry))
			}
		}
		queue := append([]executionState{}, entries...)
		seen := map[string]bool{}
		for _, entry := range entries {
			seen[environmentKey(entry.environment)] = true
		}
		for len(queue) > 0 {
			entry := queue[0]
			queue = queue[1:]
			activityBefore := routeExecutions
			iterationContinuations, err := walkBlock(body, entry)
			if err != nil {
				return nil, err
			}
			if routeExecutions > activityBefore {
				return nil, fmt.Errorf("duplicate route registration may execute in %s loop", kind)
			}
			if post != nil && len(iterationContinuations) > 0 {
				iterationContinuations, err = walkStatements([]ast.Stmt{post}, iterationContinuations)
				if err != nil {
					return nil, err
				}
				if routeExecutions > activityBefore {
					return nil, fmt.Errorf("duplicate route registration may execute in %s loop", kind)
				}
			}
			for _, iterationState := range uniqueStates(iterationContinuations) {
				if mayExit {
					continuations = append(continuations, cloneState(iterationState))
				}
				iterationKey := environmentKey(iterationState.environment)
				if seen[iterationKey] {
					continue
				}
				if len(seen) >= maxReceiverLoopStates {
					return nil, fmt.Errorf("unsupported unbounded Fiber receiver mutation in %s loop in %s", kind, info.decl.Name.Name)
				}
				seen[iterationKey] = true
				queue = append(queue, cloneState(iterationState))
			}
		}
		return uniqueStates(continuations), nil
	}

	walkStatement = func(statement ast.Stmt, state executionState) ([]executionState, error) {
		switch value := statement.(type) {
		case *ast.AssignStmt:
			for _, expression := range value.Rhs {
				if err := walkExpression(expression, &state); err != nil {
					return nil, err
				}
			}
			next := cloneState(state)
			if err := analyzer.assignReceivers(value.Lhs, value.Rhs, next.environment, info.decl.Name.Name); err != nil {
				return nil, err
			}
			return []executionState{next}, nil
		case *ast.DeclStmt:
			next := cloneState(state)
			declaration, ok := value.Decl.(*ast.GenDecl)
			if !ok {
				return nil, fmt.Errorf("unsupported Fiber route declaration in %s", info.decl.Name.Name)
			}
			for _, specification := range declaration.Specs {
				variable, ok := specification.(*ast.ValueSpec)
				if !ok {
					continue
				}
				for _, expression := range variable.Values {
					if err := walkExpression(expression, &next); err != nil {
						return nil, err
					}
				}
				left := make([]ast.Expr, len(variable.Names))
				for index, name := range variable.Names {
					left[index] = name
				}
				if err := analyzer.assignReceivers(left, variable.Values, next.environment, info.decl.Name.Name); err != nil {
					return nil, err
				}
			}
			return []executionState{next}, nil
		case *ast.ReturnStmt:
			for _, expression := range value.Results {
				if err := walkExpression(expression, &state); err != nil {
					return nil, err
				}
			}
			if info.returnsRouter {
				if len(value.Results) != 1 {
					return nil, fmt.Errorf("Fiber route helper %s must return one receiver", info.decl.Name.Name)
				}
				receiver, err := analyzer.evaluateReceiver(value.Results[0], state.environment, info.decl.Name.Name)
				if err != nil {
					return nil, err
				}
				if !receiver.known {
					return nil, fmt.Errorf("unresolved Fiber route helper return in %s", info.decl.Name.Name)
				}
				returns = append(returns, receiver)
			}
			completed = append(completed, cloneState(state))
			return nil, nil
		case *ast.BlockStmt:
			return walkBlock(value, state)
		case *ast.IfStmt:
			branches := []executionState{cloneState(state)}
			initDeclarations := []string{}
			if value.Init != nil {
				initDeclarations = lexicalDeclarations([]ast.Stmt{value.Init})
				var err error
				branches, err = walkStatements([]ast.Stmt{value.Init}, branches)
				if err != nil {
					return nil, err
				}
			}
			condition, static := staticBool(value.Cond)
			continuations := []executionState{}
			for _, branchState := range branches {
				if err := walkExpression(value.Cond, &branchState); err != nil {
					return nil, err
				}
				if !static || condition {
					bodyContinuations, err := walkBlock(value.Body, branchState)
					if err != nil {
						return nil, err
					}
					continuations = append(continuations, bodyContinuations...)
				}
				if static && condition {
					continue
				}
				if value.Else == nil {
					continuations = append(continuations, cloneState(branchState))
					continue
				}
				alternateContinuations, err := walkStatement(value.Else, branchState)
				if err != nil {
					return nil, err
				}
				continuations = append(continuations, alternateContinuations...)
			}
			restoreStateBindings(continuations, state.environment, initDeclarations)
			return uniqueStates(continuations), nil
		case *ast.SwitchStmt:
			branches := []executionState{cloneState(state)}
			initDeclarations := []string{}
			if value.Init != nil {
				initDeclarations = lexicalDeclarations([]ast.Stmt{value.Init})
				var err error
				branches, err = walkStatements([]ast.Stmt{value.Init}, branches)
				if err != nil {
					return nil, err
				}
			}
			continuations := []executionState{}
			for _, branchState := range branches {
				if value.Tag != nil {
					if err := walkExpression(value.Tag, &branchState); err != nil {
						return nil, err
					}
				}
				hasDefault := false
				for _, clauseNode := range value.Body.List {
					clause, ok := clauseNode.(*ast.CaseClause)
					if !ok {
						return nil, fmt.Errorf("unsupported Fiber route helper switch clause in %s", info.decl.Name.Name)
					}
					hasDefault = hasDefault || clause.List == nil
					clauseState := cloneState(branchState)
					for _, expression := range clause.List {
						if err := walkExpression(expression, &clauseState); err != nil {
							return nil, err
						}
					}
					clauseContinuations, err := walkStatements(clause.Body, []executionState{clauseState})
					if err != nil {
						return nil, err
					}
					continuations = append(continuations, clauseContinuations...)
				}
				if !hasDefault {
					continuations = append(continuations, cloneState(branchState))
				}
			}
			restoreStateBindings(continuations, state.environment, initDeclarations)
			return uniqueStates(continuations), nil
		case *ast.TypeSwitchStmt:
			branches := []executionState{cloneState(state)}
			if value.Init != nil {
				var err error
				branches, err = walkStatements([]ast.Stmt{value.Init}, branches)
				if err != nil {
					return nil, err
				}
			}
			if value.Assign != nil {
				var err error
				branches, err = walkStatements([]ast.Stmt{value.Assign}, branches)
				if err != nil {
					return nil, err
				}
			}
			continuations := []executionState{}
			for _, branchState := range branches {
				hasDefault := false
				for _, clauseNode := range value.Body.List {
					clause := clauseNode.(*ast.CaseClause)
					hasDefault = hasDefault || clause.List == nil
					clauseContinuations, err := walkStatements(clause.Body, []executionState{cloneState(branchState)})
					if err != nil {
						return nil, err
					}
					continuations = append(continuations, clauseContinuations...)
				}
				if !hasDefault {
					continuations = append(continuations, cloneState(branchState))
				}
			}
			return uniqueStates(continuations), nil
		case *ast.SelectStmt:
			continuations := []executionState{}
			for _, clauseNode := range value.Body.List {
				clause := clauseNode.(*ast.CommClause)
				clauseStates := []executionState{cloneState(state)}
				if clause.Comm != nil {
					var err error
					clauseStates, err = walkStatements([]ast.Stmt{clause.Comm}, clauseStates)
					if err != nil {
						return nil, err
					}
				}
				clauseContinuations, err := walkStatements(clause.Body, clauseStates)
				if err != nil {
					return nil, err
				}
				continuations = append(continuations, clauseContinuations...)
			}
			return uniqueStates(continuations), nil
		case *ast.ForStmt:
			entries := []executionState{cloneState(state)}
			if value.Init != nil {
				var err error
				entries, err = walkStatements([]ast.Stmt{value.Init}, entries)
				if err != nil {
					return nil, err
				}
			}
			for index := range entries {
				if value.Cond != nil {
					if err := walkExpression(value.Cond, &entries[index]); err != nil {
						return nil, err
					}
				}
			}
			return walkLoop(value.Body, value.Post, entries, value.Cond != nil, "for")
		case *ast.RangeStmt:
			if err := walkExpression(value.X, &state); err != nil {
				return nil, err
			}
			for _, expression := range []ast.Expr{value.Key, value.Value} {
				identifier, ok := expression.(*ast.Ident)
				if ok && identifier.Name != "_" {
					if _, tracked := state.environment[identifier.Name]; tracked {
						return nil, fmt.Errorf("unsupported Fiber range receiver binding in %s", info.decl.Name.Name)
					}
				}
			}
			return walkLoop(value.Body, nil, []executionState{cloneState(state)}, true, "range")
		case *ast.LabeledStmt:
			return walkStatement(value.Stmt, state)
		case *ast.ExprStmt:
			if err := walkExpression(value.X, &state); err != nil {
				return nil, err
			}
			if call, ok := value.X.(*ast.CallExpr); ok {
				if identifier, ok := call.Fun.(*ast.Ident); ok && identifier.Name == "panic" {
					completed = append(completed, cloneState(state))
					return nil, nil
				}
			}
			return []executionState{cloneState(state)}, nil
		case *ast.DeferStmt:
			if err := walkExpression(value.Call, &state); err != nil {
				return nil, err
			}
			return []executionState{cloneState(state)}, nil
		case *ast.GoStmt:
			if err := walkExpression(value.Call, &state); err != nil {
				return nil, err
			}
			return []executionState{cloneState(state)}, nil
		case *ast.SendStmt:
			if err := walkExpression(value.Chan, &state); err != nil {
				return nil, err
			}
			if err := walkExpression(value.Value, &state); err != nil {
				return nil, err
			}
			return []executionState{cloneState(state)}, nil
		case *ast.EmptyStmt:
			return []executionState{cloneState(state)}, nil
		case *ast.IncDecStmt:
			if identifier, ok := value.X.(*ast.Ident); ok {
				if _, tracked := state.environment[identifier.Name]; tracked {
					return nil, fmt.Errorf("unsupported Fiber route helper receiver increment in %s", info.decl.Name.Name)
				}
			}
			return []executionState{cloneState(state)}, nil
		case *ast.BranchStmt:
			return nil, fmt.Errorf("unsupported Fiber route helper branch statement %s in %s", value.Tok, info.decl.Name.Name)
		default:
			return nil, fmt.Errorf("unsupported Fiber route helper control flow %T in %s", statement, info.decl.Name.Name)
		}
	}

	continuations, err := walkBlock(info.decl.Body, executionState{environment: environment, routes: map[string]int{}})
	if err != nil {
		return functionResult{}, err
	}
	completed = append(completed, continuations...)
	result := functionResult{routes: map[string]int{}}
	for _, state := range completed {
		for route, count := range state.routes {
			if count > result.routes[route] {
				result.routes[route] = count
			}
		}
	}
	if info.returnsRouter {
		if len(returns) == 0 {
			return functionResult{}, fmt.Errorf("Fiber route helper %s has no resolvable return", info.decl.Name.Name)
		}
		prefix := returns[0].prefix
		for _, value := range returns[1:] {
			if value.prefix != prefix {
				return functionResult{}, fmt.Errorf("ambiguous Fiber route helper return prefixes in %s", info.decl.Name.Name)
			}
		}
		result.receiver = receiverValue{prefix: prefix, known: true}
	}
	analyzer.results[key] = functionResult{receiver: result.receiver, routes: cloneRoutes(result.routes)}
	return result, nil
}

func containsFiberNew(info *functionInfo) bool {
	found := false
	ast.Inspect(info.decl.Body, func(node ast.Node) bool {
		if found {
			return false
		}
		call, ok := node.(*ast.CallExpr)
		if !ok {
			return true
		}
		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		packageName, ok := selector.X.(*ast.Ident)
		if ok && packageName.Name == "fiber" && selector.Sel.Name == "New" {
			found = true
		}
		return true
	})
	return found
}

func containsRouteMethod(info *functionInfo) bool {
	found := false
	ast.Inspect(info.decl.Body, func(node ast.Node) bool {
		if _, nested := node.(*ast.FuncLit); nested {
			return false
		}
		call, ok := node.(*ast.CallExpr)
		if !ok {
			return true
		}
		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		_, found = routeMethods[selector.Sel.Name]
		return !found
	})
	return found
}

func discover(root string) (inventory, error) {
	fset, functions, methods, err := parseFunctions(root)
	if err != nil {
		return inventory{}, err
	}
	analyzer := &packageAnalyzer{
		fset:         fset,
		functions:    functions,
		methods:      methods,
		routeRecords: map[string]routeRecord{},
		invoked:      map[string]bool{},
		active:       map[string]bool{},
		results:      map[string]functionResult{},
	}
	roots := []*functionInfo{}
	for _, info := range functions {
		if containsFiberNew(info) || (info.decl.Name.Name == "routes" && len(info.routeParamIndexes) > 0) {
			roots = append(roots, info)
		}
	}
	if len(roots) == 0 {
		return inventory{}, fmt.Errorf("no Fiber route root found")
	}
	sort.Slice(roots, func(i, j int) bool { return roots[i].decl.Name.Name < roots[j].decl.Name.Name })
	packageState := executionState{environment: map[string]receiverValue{}, routes: map[string]int{}}
	for _, rootInfo := range roots {
		arguments := map[int]receiverValue{}
		for index := range rootInfo.routeParamIndexes {
			arguments[index] = receiverValue{prefix: "", known: true}
		}
		result, err := analyzer.analyzeFunction(rootInfo, arguments)
		if err != nil {
			return inventory{}, err
		}
		if err := analyzer.addRouteOccurrences(&packageState, result.routes, nil); err != nil {
			return inventory{}, err
		}
	}
	for name, info := range functions {
		if len(info.routeParamIndexes) > 0 && containsRouteMethod(info) && !analyzer.invoked[name] {
			return inventory{}, fmt.Errorf("uncalled Fiber route helper: %s", name)
		}
	}
	sort.Slice(analyzer.routes, func(i, j int) bool {
		left := analyzer.routes[i].Method + " " + analyzer.routes[i].Path
		right := analyzer.routes[j].Method + " " + analyzer.routes[j].Path
		if left == right {
			return analyzer.routes[i].File < analyzer.routes[j].File
		}
		return left < right
	})
	files := map[string]struct{}{}
	for _, route := range analyzer.routes {
		files[route.File] = struct{}{}
	}
	return inventory{SchemaVersion: "tts-research.route-inventory.v2", SourceFiles: len(files), Routes: analyzer.routes}, nil
}

func main() {
	root := flag.String("root", "internal/httpapi", "Go source tree containing Fiber route registrations")
	flag.Parse()
	result, err := discover(*root)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(result); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
