package sourceprep

import "testing"

func TestAnalyzeURLSafetyClassifiesExternalAndUnsupportedURLs(t *testing.T) {
	t.Parallel()

	external := AnalyzeURLSafety("https://example.com/article", false)
	if !external.Allowed || external.Class != URLSafetyExternal || !external.LeavesMachine {
		t.Fatalf("external safety = %#v, want allowed external boundary", external)
	}
	if external.Warning == "" {
		t.Fatalf("external warning missing: %#v", external)
	}

	unsupported := AnalyzeURLSafety("file:///etc/passwd", false)
	if unsupported.Allowed || unsupported.Class != URLSafetyUnsupported {
		t.Fatalf("unsupported safety = %#v, want blocked unsupported scheme", unsupported)
	}
	if err := ValidateURLSafety(unsupported); err == nil {
		t.Fatalf("ValidateURLSafety accepted unsupported URL")
	}
}

func TestAnalyzeURLSafetyBlocksLocalAndPrivateByDefault(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		rawURL string
		want   URLSafetyClass
		leaves bool
	}{
		{name: "localhost", rawURL: "http://localhost:5173/demo", want: URLSafetyLocalMachine},
		{name: "loopback", rawURL: "http://127.0.0.1:8080/demo", want: URLSafetyLocalMachine},
		{name: "unspecified", rawURL: "http://0.0.0.0:8080/demo", want: URLSafetyLocalMachine},
		{name: "rfc1918-10", rawURL: "http://10.0.0.2/story", want: URLSafetyPrivateNetwork, leaves: true},
		{name: "rfc1918-172", rawURL: "http://172.16.1.4/story", want: URLSafetyPrivateNetwork, leaves: true},
		{name: "rfc1918-192", rawURL: "http://192.168.1.12/story", want: URLSafetyPrivateNetwork, leaves: true},
		{name: "link-local", rawURL: "http://169.254.0.10/story", want: URLSafetyPrivateNetwork, leaves: true},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			report := AnalyzeURLSafety(testCase.rawURL, false)
			if report.Allowed || report.Class != testCase.want || report.LeavesMachine != testCase.leaves {
				t.Fatalf("AnalyzeURLSafety() = %#v, want class %q leaves=%v blocked", report, testCase.want, testCase.leaves)
			}
			if err := ValidateURLSafety(report); err == nil {
				t.Fatalf("ValidateURLSafety accepted %s", testCase.rawURL)
			}
		})
	}
}

func TestAnalyzeURLSafetyAllowsPrivateWhenRuntimeOptsIn(t *testing.T) {
	t.Parallel()

	report := AnalyzeURLSafety("http://192.168.1.12/story", true)
	if !report.Allowed || report.Class != URLSafetyPrivateNetwork {
		t.Fatalf("private opt-in safety = %#v, want allowed private-network URL", report)
	}
	if err := ValidateURLSafety(report); err != nil {
		t.Fatalf("ValidateURLSafety returned %v, want allowed", err)
	}
}
