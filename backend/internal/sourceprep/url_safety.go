package sourceprep

import (
	"fmt"
	"net"
	"net/url"
	"strings"
)

type URLSafetyClass string

const (
	URLSafetyInvalid        URLSafetyClass = "invalid"
	URLSafetyUnsupported    URLSafetyClass = "unsupported"
	URLSafetyExternal       URLSafetyClass = "external"
	URLSafetyPrivateNetwork URLSafetyClass = "privateNetwork"
	URLSafetyLocalMachine   URLSafetyClass = "localMachine"
)

type URLSafetyReport struct {
	Allowed             bool           `json:"allowed"`
	AllowPrivateNetwork bool           `json:"allowPrivateNetwork"`
	Class               URLSafetyClass `json:"class"`
	Host                string         `json:"host,omitempty"`
	LeavesMachine       bool           `json:"leavesMachine"`
	NormalizedURL       string         `json:"normalizedUrl,omitempty"`
	Reason              string         `json:"reason"`
	Scheme              string         `json:"scheme,omitempty"`
	Warning             string         `json:"warning,omitempty"`
}

func AnalyzeURLSafety(rawURL string, allowPrivateNetwork bool) URLSafetyReport {
	clean := strings.TrimSpace(rawURL)
	report := URLSafetyReport{
		AllowPrivateNetwork: allowPrivateNetwork,
		Class:               URLSafetyInvalid,
		Reason:              "Enter a valid http or https URL.",
	}
	parsed, err := url.Parse(clean)
	if err != nil || parsed.Scheme == "" {
		return report
	}

	scheme := strings.ToLower(parsed.Scheme)
	report.NormalizedURL = parsed.String()
	report.Scheme = scheme
	if scheme != "http" && scheme != "https" {
		report.Class = URLSafetyUnsupported
		report.Reason = "Only http and https URLs are supported."
		return report
	}
	if parsed.Host == "" {
		return report
	}

	host := strings.ToLower(strings.TrimSpace(parsed.Hostname()))
	report.Host = host
	hostClass := classifyURLHost(host)
	report.Class = hostClass
	report.LeavesMachine = hostClass == URLSafetyExternal || hostClass == URLSafetyPrivateNetwork
	report.Allowed = allowPrivateNetwork || hostClass == URLSafetyExternal
	switch hostClass {
	case URLSafetyLocalMachine:
		report.Reason = "The URL points at this machine."
		report.Warning = "Localhost URLs are blocked by default unless private URL intake is explicitly enabled."
	case URLSafetyPrivateNetwork:
		report.Reason = "The URL points at a private network address."
		report.Warning = "Private-network URLs are blocked by default unless private URL intake is explicitly enabled."
	default:
		report.Reason = "The URL will be fetched by the local backend before extraction."
		report.Warning = "External URL intake downloads readable content to the local source-prep store."
	}
	if report.Allowed && hostClass != URLSafetyExternal {
		report.Warning = "Private URL intake is enabled for this runtime; fetched content stays in local source-prep storage."
	}
	return report
}

func ValidateURLSafety(report URLSafetyReport) error {
	if report.Class == URLSafetyInvalid {
		return fmt.Errorf("enter a valid http or https URL")
	}
	if report.Class == URLSafetyUnsupported {
		return fmt.Errorf("only http and https URLs are supported")
	}
	if !report.Allowed {
		return fmt.Errorf("URL resolves to a private or local address")
	}
	return nil
}

func IsPrivateOrLocalIP(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified()
}

func classifyURLHost(host string) URLSafetyClass {
	clean := strings.Trim(host, "[]")
	if clean == "localhost" || strings.HasSuffix(clean, ".localhost") {
		return URLSafetyLocalMachine
	}
	if ip := net.ParseIP(clean); ip != nil {
		if ip.IsLoopback() || ip.IsUnspecified() {
			return URLSafetyLocalMachine
		}
		if IsPrivateOrLocalIP(ip) {
			return URLSafetyPrivateNetwork
		}
	}
	return URLSafetyExternal
}
