package pipeline

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestPythonModuleAvailableTimesOutForHangingExecutable(t *testing.T) {
	fakePython := filepath.Join(t.TempDir(), "hanging-python")
	if err := os.WriteFile(fakePython, []byte("#!/bin/sh\nexec sleep 10\n"), 0o755); err != nil {
		t.Fatalf("write hanging Python executable: %v", err)
	}
	service := &Service{options: Options{BookPDFPythonPath: fakePython}}

	startedAt := time.Now()
	available := service.pythonModuleAvailable("fitz")
	elapsed := time.Since(startedAt)

	if available {
		t.Fatal("pythonModuleAvailable returned true for a hanging executable")
	}
	if elapsed > 2*time.Second {
		t.Fatalf("pythonModuleAvailable took %s, want at most 2s", elapsed)
	}
}
