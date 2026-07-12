package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeGoFile(t *testing.T, directory string, name string, source string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(directory, name), []byte(source), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestDiscoverDirectGroupedAndHelperRoutes(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App) {
  app.Get("/health", nil)
  api := app.Group("/api")
  api.Post("/projects", nil)
}
`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if result.SourceFiles != 1 || len(result.Routes) != 2 {
		t.Fatalf("inventory = %#v", result)
	}
	got := []string{
		result.Routes[0].Method + " " + result.Routes[0].Path,
		result.Routes[1].Method + " " + result.Routes[1].Path,
	}
	if strings.Join(got, ",") != "GET /health,POST /api/projects" {
		t.Fatalf("routes = %v", got)
	}
}

func TestDiscoverRejectsComputedRoutePath(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App, route string) { app.Get(route, nil) }
`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "computed route path") {
		t.Fatalf("error = %v", err)
	}
}

func TestDiscoverRejectsComputedGroupPrefix(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App, prefix string) { api := app.Group(prefix); api.Get("/health", nil) }
`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "computed group prefix") {
		t.Fatalf("error = %v", err)
	}
}

func TestDiscoverPropagatesAliasedReceiver(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App) { router := app; router.Get("/alias", nil) }
`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Routes) != 1 || result.Routes[0].Path != "/alias" {
		t.Fatalf("inventory = %#v", result)
	}
}

func TestDiscoverClassifiesFiberRouterParameter(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func helper(router fiber.Router) { router.Post("/helper", nil) }
func routes(app *fiber.App) { helper(app) }
`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Routes) != 1 || result.Routes[0].Path != "/helper" {
		t.Fatalf("inventory = %#v", result)
	}
}

func TestDiscoverPropagatesReturnedGroupedReceiver(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func api(app *fiber.App) fiber.Router { router := app.Group("/api"); return router }
func routes(app *fiber.App) { api(app).Put("/returned", nil) }
`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Routes) != 1 || result.Routes[0].Path != "/api/returned" {
		t.Fatalf("inventory = %#v", result)
	}
}

func TestDiscoverPropagatesGroupedHelperArgument(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func helper(router fiber.Router) { router.Post("/helper", nil) }
func routes(app *fiber.App) { api := app.Group("/api"); helper(api) }
`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Routes) != 1 || result.Routes[0].Path != "/api/helper" {
		t.Fatalf("inventory = %#v", result)
	}
}

func TestDiscoverRejectsElseIfAmbiguousReturnedGroup(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func api(app *fiber.App, first, second bool) fiber.Router {
	if first { return app.Group("/same") } else if second { return app.Group("/different") } else { return app.Group("/same") }
}
func routes(app *fiber.App, first, second bool) { api(app, first, second).Get("/x", nil) }`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "ambiguous Fiber route helper return prefixes") {
		t.Fatalf("expected else-if ambiguity error, got %v", err)
	}
}

func TestDiscoverRejectsConditionalReassignmentAmbiguousReturnedGroup(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func api(app *fiber.App, different bool) fiber.Router {
	router := app.Group("/same")
	if different {
		router = app.Group("/different")
	}
	return router
}
func routes(app *fiber.App, different bool) {
	api(app, different).Get("/x", nil)
}`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "ambiguous Fiber route helper return prefixes") {
		t.Fatalf("expected conditional reassignment ambiguity error, got %v", err)
	}
}

func TestDiscoverRejectsConditionalParallelReceiverSwapInReturnedHelper(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
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
}`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "ambiguous Fiber route helper return prefixes") {
		t.Fatalf("expected conditional parallel-swap ambiguity error, got %v", err)
	}
}

func TestDiscoverRejectsDirectConditionalReceiverReassignment(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App, different bool) {
	router := app.Group("/same")
	if different {
		router = app.Group("/different")
	}
	router.Get("/x", nil)
}`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "ambiguous Fiber route receiver prefixes") {
		t.Fatalf("expected direct conditional receiver ambiguity error, got %v", err)
	}
}

func TestDiscoverRejectsRangeReceiverMutationBeforeRouteCall(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App, values []int) {
	router := app.Group("/same")
	for range values {
		router = app.Group("/different")
	}
	router.Get("/x", nil)
}`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "ambiguous Fiber route receiver prefixes") {
		t.Fatalf("expected range receiver ambiguity error, got %v", err)
	}
}

func TestDiscoverTraversesDirectTypeSwitchAndSelectRegistrations(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
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
}`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if result.SourceFiles != 1 || len(result.Routes) != 2 {
		t.Fatalf("inventory = %#v", result)
	}
	got := []string{
		result.Routes[0].Method + " " + result.Routes[0].Path,
		result.Routes[1].Method + " " + result.Routes[1].Path,
	}
	if strings.Join(got, ",") != "GET /select,GET /type" {
		t.Fatalf("routes = %v", got)
	}
}

func TestDiscoverRejectsMultiResultReceiverAssignment(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func api(app *fiber.App) (fiber.Router, error) { return app.Group("/api"), nil }
func routes(app *fiber.App) {
	router, err := api(app)
	_ = err
	router.Get("/x", nil)
}`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "unsupported multi-result Fiber receiver call") {
		t.Fatalf("expected multi-result receiver assignment error, got %v", err)
	}
}

func TestDiscoverRejectsSwitchAmbiguousReturnedGroup(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func api(app *fiber.App, different bool) fiber.Router {
	switch {
	case different:
		return app.Group("/different")
	}
	return app.Group("/same")
}
func routes(app *fiber.App, different bool) {
	api(app, different).Get("/x", nil)
}`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "ambiguous Fiber route helper return prefixes") {
		t.Fatalf("expected switch ambiguity error, got %v", err)
	}
}

func TestDiscoverRejectsForAmbiguousReturnedGroup(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func api(app *fiber.App, different bool) fiber.Router {
	for different {
		return app.Group("/different")
	}
	return app.Group("/same")
}
func routes(app *fiber.App, different bool) {
	api(app, different).Get("/x", nil)
}`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "ambiguous Fiber route helper return prefixes") {
		t.Fatalf("expected for-loop ambiguity error, got %v", err)
	}
}

func TestDiscoverRejectsUncalledRouteHelper(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func helper(router fiber.Router) { router.Post("/hidden", nil) }
func routes(app *fiber.App) { app.Get("/health", nil) }
`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "uncalled Fiber route helper") {
		t.Fatalf("error = %v", err)
	}
}

func TestDiscoverRejectsUnknownRouteReceiver(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
type customRouter struct{}
func (customRouter) Get(string, any) {}
func routes(app *fiber.App) { var router customRouter; router.Get("/hidden", nil) }
`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "unclassified Fiber route receiver") {
		t.Fatalf("error = %v", err)
	}
}

func TestDiscoverRejectsDuplicateRegistration(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App) { app.Get("/health", nil); app.Get("/health", nil) }
`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "duplicate route registration") {
		t.Fatalf("error = %v", err)
	}
}

func inventoryRouteNames(result inventory) string {
	routes := make([]string, len(result.Routes))
	for index, route := range result.Routes {
		routes[index] = route.Method + " " + route.Path
	}
	return strings.Join(routes, ",")
}

func TestDiscoverRestoresLexicallyShadowedReceiverAfterNestedBlock(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App) {
	router := app.Group("/outer")
	{
		router := app.Group("/inner")
		router.Get("/inside", nil)
	}
	router.Get("/after", nil)
}
`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := inventoryRouteNames(result); got != "GET /inner/inside,GET /outer/after" {
		t.Fatalf("routes = %s", got)
	}
}

func TestDiscoverRestoresLexicallyShadowedReceiverAfterIfInit(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App) {
	router := app.Group("/outer")
	if router := app.Group("/inner"); true {
		router.Get("/inside", nil)
	}
	router.Get("/after", nil)
}
`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := inventoryRouteNames(result); got != "GET /inner/inside,GET /outer/after" {
		t.Fatalf("routes = %s", got)
	}
}

func TestDiscoverTraversesInvokedReceiverMethod(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
type registrar struct{}
func (registrar) add(app *fiber.App) { app.Get("/hidden-method", nil) }
func routes(app *fiber.App) { app.Get("/visible", nil); registrar{}.add(app) }
`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := inventoryRouteNames(result); got != "GET /hidden-method,GET /visible" {
		t.Fatalf("routes = %s", got)
	}
}

func TestDiscoverTraversesInvokedFunctionLiteral(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App) {
	app.Get("/visible", nil)
	helper := func(router *fiber.App) { router.Get("/hidden-closure", nil) }
	helper(app)
}
`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := inventoryRouteNames(result); got != "GET /hidden-closure,GET /visible" {
		t.Fatalf("routes = %s", got)
	}
}

func TestDiscoverTraversesRouteCallInIfCondition(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App) {
	if app.Get("/hidden-condition", nil) != nil { app.Get("/visible", nil) }
}
`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := inventoryRouteNames(result); got != "GET /hidden-condition,GET /visible" {
		t.Fatalf("routes = %s", got)
	}
}

func TestDiscoverRejectsRepeatedRouteHelperInvocation(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func helper(app *fiber.App) { app.Get("/duplicate", nil) }
func routes(app *fiber.App) { helper(app); helper(app) }
`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "duplicate route registration") {
		t.Fatalf("error = %v", err)
	}
}

func TestDiscoverRejectsRouteRegistrationInRepeatedLoop(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App) {
	for range []int{1, 2} { app.Get("/repeated", nil) }
}
`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "duplicate route registration") {
		t.Fatalf("error = %v", err)
	}
}

func TestDiscoverPrunesStaticallyFalseBranch(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App) {
	if false { app.Get("/dead", nil) }
	app.Get("/live", nil)
}
`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := inventoryRouteNames(result); got != "GET /live" {
		t.Fatalf("routes = %s", got)
	}
}

func TestDiscoverStopsAfterUnconditionalPanic(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App) {
	panic("stop")
	app.Get("/after-panic", nil)
}
`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Routes) != 0 {
		t.Fatalf("inventory = %#v", result)
	}
}

func TestDiscoverExcludesBuildConstrainedRouteRoot(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "impossible.go", `//go:build linux && !linux

package sample
import "github.com/gofiber/fiber/v3"
func impossibleRoutes() { app := fiber.New(); app.Get("/impossible-build", nil) }
`)
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App) { app.Get("/live", nil) }
`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := inventoryRouteNames(result); got != "GET /live" {
		t.Fatalf("routes = %s", got)
	}
}

func TestDiscoverTraversesDirectIIFE(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App) {
	(func(router *fiber.App) { router.Get("/iife", nil) })(app)
}`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := inventoryRouteNames(result); got != "GET /iife" {
		t.Fatalf("routes = %s", got)
	}
}

func TestDiscoverTraversesClosureAliasOfAlias(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App) {
	first := func(router *fiber.App) { router.Get("/closure-alias", nil) }
	second := first
	third := second
	third(app)
}`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := inventoryRouteNames(result); got != "GET /closure-alias" {
		t.Fatalf("routes = %s", got)
	}
}

func TestDiscoverTraversesNamedFunctionAlias(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func register(router *fiber.App) { router.Get("/named-alias", nil) }
func routes(app *fiber.App) { alias := register; alias(app) }
`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := inventoryRouteNames(result); got != "GET /named-alias" {
		t.Fatalf("routes = %s", got)
	}
}

func TestDiscoverRejectsRepeatedBoundMethodAliasInvocation(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
type registrar struct{}
func (registrar) add(router *fiber.App) { router.Get("/bound-method", nil) }
func routes(app *fiber.App) {
	registrar{}.add(app)
	alias := registrar{}.add
	alias(app)
}`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "duplicate route registration") {
		t.Fatalf("error = %v", err)
	}
}

func TestDiscoverTraversesExplicitGenericCalls(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func one[T any](router *fiber.App) { router.Get("/index", nil) }
func two[T, U any](router *fiber.App) { router.Get("/index-list", nil) }
func routes(app *fiber.App) { one[int](app); two[int, string](app) }
`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := inventoryRouteNames(result); got != "GET /index,GET /index-list" {
		t.Fatalf("routes = %s", got)
	}
}

func TestDiscoverRejectsDuplicateRegistrationInSwitchTag(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func register(router *fiber.App) bool { router.Get("/switch-tag", nil); return true }
func routes(app *fiber.App) { register(app); switch register(app) { default: } }
`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "duplicate route registration") {
		t.Fatalf("error = %v", err)
	}
}

func TestDiscoverRejectsDuplicateRegistrationInRangeExpression(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func register(router *fiber.App) []int { router.Get("/range-expression", nil); return nil }
func routes(app *fiber.App) { register(app); for range register(app) {} }
`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "duplicate route registration") {
		t.Fatalf("error = %v", err)
	}
}

func TestDiscoverRejectsDuplicateRegistrationInSendChannelOperand(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func channel(router *fiber.App) chan int { router.Get("/send-channel", nil); return nil }
func routes(app *fiber.App) { channel(app); channel(app) <- 0 }
`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "duplicate route registration") {
		t.Fatalf("error = %v", err)
	}
}

func TestDiscoverRejectsDuplicateRegistrationInSendValueOperand(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func value(router *fiber.App) int { router.Get("/send-value", nil); return 0 }
func routes(app *fiber.App, ch chan int) { value(app); ch <- value(app) }
`)
	_, err := discover(root)
	if err == nil || !strings.Contains(err.Error(), "duplicate route registration") {
		t.Fatalf("error = %v", err)
	}
}

func TestDiscoverAllowsSameRouteInMutuallyExclusiveBranches(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App, first bool) {
	if first { app.Get("/exclusive", nil) } else { app.Get("/exclusive", nil) }
}`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := inventoryRouteNames(result); got != "GET /exclusive" {
		t.Fatalf("routes = %s", got)
	}
}

func TestDiscoverAllowsSameRouteOnEarlyReturnAndContinuationPaths(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App, stop bool) {
	if stop { app.Get("/early", nil); return }
	app.Get("/early", nil)
}`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := inventoryRouteNames(result); got != "GET /early" {
		t.Fatalf("routes = %s", got)
	}
}

func TestDiscoverIgnoresUninvokedClosure(t *testing.T) {
	root := t.TempDir()
	writeGoFile(t, root, "routes.go", `package sample
import "github.com/gofiber/fiber/v3"
func routes(app *fiber.App) { _ = func(router *fiber.App) { router.Get("/uninvoked", nil) } }
`)
	result, err := discover(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Routes) != 0 {
		t.Fatalf("inventory = %#v", result)
	}
}
