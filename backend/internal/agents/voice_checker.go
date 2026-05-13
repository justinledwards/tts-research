package agents

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

type VoiceCheckResult struct {
	Complete    bool    `json:"complete"`
	Transcript  string  `json:"transcript"`
	ResumeText  string  `json:"resumeText,omitempty"`
	NeedsResume bool    `json:"needsResume"`
	Reason      string  `json:"reason"`
	Provider    string  `json:"provider"`
	Similarity  float64 `json:"similarity"`
}

type MockVoiceCheckerAgent struct{}

func NewMockVoiceCheckerAgent() *MockVoiceCheckerAgent {
	return &MockVoiceCheckerAgent{}
}

func (agent *MockVoiceCheckerAgent) Check(_ context.Context, optimizedText string, _ []byte) (VoiceCheckResult, error) {
	return VoiceCheckResult{
		Complete:    true,
		Transcript:  optimizedText,
		NeedsResume: false,
		Reason:      "mock checker assumes generated audio covers the optimized text",
		Provider:    "mock",
		Similarity:  1,
	}, nil
}

type QwenASRConfig struct {
	PythonPath          string
	ScriptPath          string
	DataDir             string
	Model               string
	Language            string
	Device              string
	TimeoutSeconds      int
	MaxNewTokens        int
	SimilarityThreshold float64
	Persistent          bool
}

type QwenASRVoiceCheckerAgent struct {
	config QwenASRConfig
	mu     sync.Mutex
	worker *qwenASRWorker
	nextID uint64
}

type qwenASRWorker struct {
	command *exec.Cmd
	stdin   io.WriteCloser
	stdout  *bufio.Reader
}

type qwenASRMetadata struct {
	ID         string `json:"id,omitempty"`
	Type       string `json:"type,omitempty"`
	Provider   string `json:"provider"`
	Model      string `json:"model"`
	Device     string `json:"device,omitempty"`
	Transcript string `json:"transcript"`
	Language   string `json:"language"`
	Error      string `json:"error,omitempty"`
}

func NewQwenASRVoiceCheckerAgent(config QwenASRConfig) *QwenASRVoiceCheckerAgent {
	if config.PythonPath == "" {
		config.PythonPath = "./.venv/bin/python"
	}
	if config.ScriptPath == "" {
		config.ScriptPath = "./scripts/qwen_asr_check.py"
	}
	if config.DataDir == "" {
		config.DataDir = "./data/asr"
	}
	if config.Model == "" {
		config.Model = "Qwen/Qwen3-ASR-1.7B"
	}
	if config.Language == "" {
		config.Language = "English"
	}
	if config.Device == "" {
		config.Device = "auto"
	}
	if config.TimeoutSeconds <= 0 {
		config.TimeoutSeconds = 240
	}
	if config.MaxNewTokens <= 0 {
		config.MaxNewTokens = 256
	}
	if config.SimilarityThreshold <= 0 {
		config.SimilarityThreshold = 0.82
	}

	return &QwenASRVoiceCheckerAgent{config: config}
}

func (agent *QwenASRVoiceCheckerAgent) Check(ctx context.Context, optimizedText string, wav []byte) (VoiceCheckResult, error) {
	if agent.config.Persistent {
		return agent.checkPersistent(ctx, optimizedText, wav)
	}

	return agent.checkOneShot(ctx, optimizedText, wav)
}

func (agent *QwenASRVoiceCheckerAgent) Warm(ctx context.Context) error {
	if !agent.config.Persistent {
		return nil
	}

	ctx, cancel := context.WithTimeout(ctx, time.Duration(agent.config.TimeoutSeconds)*time.Second)
	defer cancel()

	agent.mu.Lock()
	defer agent.mu.Unlock()

	_, err := agent.ensureWorker(ctx)
	return err
}

func (agent *QwenASRVoiceCheckerAgent) checkOneShot(ctx context.Context, optimizedText string, wav []byte) (VoiceCheckResult, error) {
	config := agent.config
	ctx, cancel := context.WithTimeout(ctx, time.Duration(config.TimeoutSeconds)*time.Second)
	defer cancel()

	workDir, audioPath, err := writeASRInput(config.DataDir, wav)
	if err != nil {
		return VoiceCheckResult{}, err
	}
	defer func() {
		_ = os.RemoveAll(workDir)
	}()

	command := exec.CommandContext(
		ctx,
		config.PythonPath,
		config.ScriptPath,
		"--audio",
		audioPath,
		"--model",
		config.Model,
		"--language",
		config.Language,
		"--device",
		config.Device,
		"--max-new-tokens",
		strconv.Itoa(config.MaxNewTokens),
	)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr

	if err := command.Run(); err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return VoiceCheckResult{}, fmt.Errorf("Qwen ASR timed out after %d seconds", config.TimeoutSeconds)
		}

		return VoiceCheckResult{}, fmt.Errorf("Qwen ASR failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}

	metadata, err := parseQwenASRMetadata(stdout.String())
	if err != nil {
		return VoiceCheckResult{}, err
	}

	return compareVoiceTranscript(optimizedText, metadata.Transcript, metadata.Provider, config.SimilarityThreshold), nil
}

func (agent *QwenASRVoiceCheckerAgent) checkPersistent(ctx context.Context, optimizedText string, wav []byte) (VoiceCheckResult, error) {
	config := agent.config
	ctx, cancel := context.WithTimeout(ctx, time.Duration(config.TimeoutSeconds)*time.Second)
	defer cancel()

	workDir, audioPath, err := writeASRInput(config.DataDir, wav)
	if err != nil {
		return VoiceCheckResult{}, err
	}
	defer func() {
		_ = os.RemoveAll(workDir)
	}()

	agent.mu.Lock()
	defer agent.mu.Unlock()

	worker, err := agent.ensureWorker(ctx)
	if err != nil {
		return VoiceCheckResult{}, err
	}

	agent.nextID++
	requestID := strconv.FormatUint(agent.nextID, 10)
	request := map[string]string{
		"id":       requestID,
		"audio":    audioPath,
		"language": config.Language,
	}
	payload, err := json.Marshal(request)
	if err != nil {
		return VoiceCheckResult{}, err
	}
	if _, err := worker.stdin.Write(append(payload, '\n')); err != nil {
		agent.stopWorker()
		return VoiceCheckResult{}, fmt.Errorf("write Qwen ASR request: %w", err)
	}

	line, err := readLineWithContext(ctx, worker.stdout)
	if err != nil {
		agent.stopWorker()
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return VoiceCheckResult{}, fmt.Errorf("Qwen ASR timed out after %d seconds", config.TimeoutSeconds)
		}

		return VoiceCheckResult{}, fmt.Errorf("read Qwen ASR response: %w", err)
	}

	var metadata qwenASRMetadata
	if err := json.Unmarshal([]byte(strings.TrimSpace(line)), &metadata); err != nil {
		agent.stopWorker()
		return VoiceCheckResult{}, fmt.Errorf("parse Qwen ASR response: %w", err)
	}
	if metadata.Error != "" {
		return VoiceCheckResult{}, fmt.Errorf("Qwen ASR failed: %s", metadata.Error)
	}
	if metadata.ID != requestID {
		agent.stopWorker()
		return VoiceCheckResult{}, fmt.Errorf("Qwen ASR response id %q did not match request id %q", metadata.ID, requestID)
	}
	if strings.TrimSpace(metadata.Transcript) == "" {
		return VoiceCheckResult{}, errors.New("Qwen ASR transcript was empty")
	}
	if metadata.Provider == "" {
		metadata.Provider = "qwen-asr"
	}

	return compareVoiceTranscript(optimizedText, metadata.Transcript, metadata.Provider, config.SimilarityThreshold), nil
}

func (agent *QwenASRVoiceCheckerAgent) ensureWorker(ctx context.Context) (*qwenASRWorker, error) {
	if agent.worker != nil && agent.worker.command.Process != nil {
		return agent.worker, nil
	}

	config := agent.config
	command := exec.Command(
		config.PythonPath,
		config.ScriptPath,
		"--server",
		"--model",
		config.Model,
		"--language",
		config.Language,
		"--device",
		config.Device,
		"--max-new-tokens",
		strconv.Itoa(config.MaxNewTokens),
	)
	command.Stderr = os.Stderr

	stdin, err := command.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("create Qwen ASR stdin: %w", err)
	}
	stdoutPipe, err := command.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("create Qwen ASR stdout: %w", err)
	}
	stdout := bufio.NewReader(stdoutPipe)

	if err := command.Start(); err != nil {
		return nil, fmt.Errorf("start Qwen ASR worker: %w", err)
	}

	worker := &qwenASRWorker{
		command: command,
		stdin:   stdin,
		stdout:  stdout,
	}
	agent.worker = worker

	line, err := readLineWithContext(ctx, stdout)
	if err != nil {
		agent.stopWorker()
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return nil, fmt.Errorf("Qwen ASR worker did not load within %d seconds", config.TimeoutSeconds)
		}

		return nil, fmt.Errorf("read Qwen ASR worker readiness: %w", err)
	}

	var metadata qwenASRMetadata
	if err := json.Unmarshal([]byte(strings.TrimSpace(line)), &metadata); err != nil {
		agent.stopWorker()
		return nil, fmt.Errorf("parse Qwen ASR worker readiness: %w", err)
	}
	if metadata.Type != "ready" {
		agent.stopWorker()
		return nil, fmt.Errorf("Qwen ASR worker returned unexpected readiness message: %s", strings.TrimSpace(line))
	}

	return worker, nil
}

func (agent *QwenASRVoiceCheckerAgent) stopWorker() {
	if agent.worker == nil {
		return
	}

	_ = agent.worker.stdin.Close()
	if agent.worker.command.Process != nil {
		_ = agent.worker.command.Process.Kill()
	}
	_ = agent.worker.command.Wait()
	agent.worker = nil
}

func writeASRInput(dataDir string, wav []byte) (string, string, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return "", "", fmt.Errorf("create ASR data dir: %w", err)
	}

	workDir, err := os.MkdirTemp(dataDir, "check-*")
	if err != nil {
		return "", "", fmt.Errorf("create ASR work dir: %w", err)
	}

	audioPath := filepath.Join(workDir, "audio.wav")
	if err := os.WriteFile(audioPath, wav, 0o600); err != nil {
		_ = os.RemoveAll(workDir)
		return "", "", fmt.Errorf("write ASR input: %w", err)
	}

	return workDir, audioPath, nil
}

type lineResult struct {
	line string
	err  error
}

func readLineWithContext(ctx context.Context, reader *bufio.Reader) (string, error) {
	result := make(chan lineResult, 1)
	go func() {
		line, err := reader.ReadString('\n')
		result <- lineResult{line: line, err: err}
	}()

	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case value := <-result:
		return value.line, value.err
	}
}

func parseQwenASRMetadata(stdout string) (qwenASRMetadata, error) {
	lines := strings.Split(strings.TrimSpace(stdout), "\n")
	for index := len(lines) - 1; index >= 0; index-- {
		line := strings.TrimSpace(lines[index])
		if line == "" {
			continue
		}

		var metadata qwenASRMetadata
		if err := json.Unmarshal([]byte(line), &metadata); err != nil {
			return qwenASRMetadata{}, fmt.Errorf("parse Qwen ASR metadata: %w", err)
		}
		if strings.TrimSpace(metadata.Transcript) == "" {
			return qwenASRMetadata{}, errors.New("Qwen ASR transcript was empty")
		}
		if metadata.Provider == "" {
			metadata.Provider = "qwen-asr"
		}

		return metadata, nil
	}

	return qwenASRMetadata{}, errors.New("Qwen ASR did not return metadata")
}

func compareVoiceTranscript(expectedText string, transcript string, provider string, threshold float64) VoiceCheckResult {
	expectedTokens := tokenizedWords(expectedText)
	transcriptTokens := tokenizedWords(transcript)
	if len(expectedTokens) == 0 || len(transcriptTokens) == 0 {
		return VoiceCheckResult{
			Complete:    false,
			Transcript:  transcript,
			NeedsResume: false,
			Reason:      "checker could not compare empty expected text or transcript",
			Provider:    provider,
			Similarity:  0,
		}
	}

	expectedNormalized := normalizedOnly(expectedTokens)
	transcriptNormalized := normalizedOnly(transcriptTokens)
	lcs := longestCommonSubsequenceLength(expectedNormalized, transcriptNormalized)
	similarity := float64(lcs) / float64(len(expectedNormalized))
	if relaxedSimilarity := similarityWithoutOptionalTokens(expectedNormalized, transcriptNormalized); relaxedSimilarity > similarity {
		similarity = relaxedSimilarity
	}
	if similarity >= threshold {
		return VoiceCheckResult{
			Complete:    true,
			Transcript:  transcript,
			NeedsResume: false,
			Reason:      "ASR transcript sufficiently matched optimized text",
			Provider:    provider,
			Similarity:  similarity,
		}
	}

	prefixLength := commonPrefixLength(expectedNormalized, transcriptNormalized)
	cleanCutoff := prefixLength > 0 &&
		prefixLength < len(expectedTokens) &&
		float64(prefixLength)/float64(len(transcriptTokens)) >= 0.65
	if cleanCutoff {
		return VoiceCheckResult{
			Complete:    false,
			Transcript:  transcript,
			ResumeText:  originalTextFromTokens(expectedTokens[prefixLength:]),
			NeedsResume: true,
			Reason:      "ASR transcript appears to be a clean cutoff; resume text was selected",
			Provider:    provider,
			Similarity:  similarity,
		}
	}

	return VoiceCheckResult{
		Complete:    false,
		Transcript:  transcript,
		NeedsResume: false,
		Reason:      "ASR transcript did not sufficiently match and did not look like a clean cutoff",
		Provider:    provider,
		Similarity:  similarity,
	}
}

type wordToken struct {
	Original   string
	Normalized string
}

func tokenizedWords(text string) []wordToken {
	fields := strings.Fields(spokenComparisonText(text))
	tokens := make([]wordToken, 0, len(fields))
	for _, field := range fields {
		normalized := normalizeSpokenWord(field)
		if normalized == "" {
			continue
		}
		if expanded := expandNormalizedWord(field, normalized); len(expanded) > 0 {
			for index, value := range expanded {
				original := field
				if index > 0 {
					original = ""
				}
				tokens = append(tokens, wordToken{Original: original, Normalized: value})
			}
			continue
		}

		tokens = append(tokens, wordToken{Original: field, Normalized: normalized})
	}

	return tokens
}

func normalizedOnly(tokens []wordToken) []string {
	values := make([]string, 0, len(tokens))
	for _, token := range tokens {
		values = append(values, token.Normalized)
	}

	return values
}

func similarityWithoutOptionalTokens(expected []string, transcript []string) float64 {
	filteredExpected := withoutOptionalComparisonTokens(expected)
	filteredTranscript := withoutOptionalComparisonTokens(transcript)
	if len(filteredExpected) == 0 || len(filteredTranscript) == 0 {
		return 0
	}

	lcs := longestCommonSubsequenceLength(filteredExpected, filteredTranscript)
	return float64(lcs) / float64(len(filteredExpected))
}

func withoutOptionalComparisonTokens(values []string) []string {
	filtered := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := optionalComparisonTokens[value]; ok {
			continue
		}
		filtered = append(filtered, value)
	}

	return filtered
}

func originalTextFromTokens(tokens []wordToken) string {
	values := make([]string, 0, len(tokens))
	for _, token := range tokens {
		if token.Original == "" {
			continue
		}
		values = append(values, token.Original)
	}

	return strings.Join(values, " ")
}

func normalizeSpokenWord(value string) string {
	return nonWordPattern.ReplaceAllString(strings.ToLower(value), "")
}

func spokenComparisonText(text string) string {
	replaced := comparisonTLDRPattern.ReplaceAllString(text, " too long did not read ")
	replaced = comparisonUS3Pattern.ReplaceAllString(replaced, " U S ")
	replaced = comparisonWhoisPattern.ReplaceAllString(replaced, " who is ")
	replaced = comparisonDashPattern.ReplaceAllString(replaced, " ")
	replaced = comparisonItalicDomainPattern.ReplaceAllStringFunc(replaced, func(value string) string {
		match := comparisonItalicDomainPattern.FindStringSubmatch(value)
		if len(match) != 2 {
			return value
		}

		return spokenComparisonDomain("*." + match[1])
	})
	replaced = comparisonEmailPattern.ReplaceAllStringFunc(replaced, spokenComparisonEmail)
	replaced = comparisonDomainPattern.ReplaceAllStringFunc(replaced, spokenComparisonDomain)
	replaced = comparisonDotFragmentPattern.ReplaceAllStringFunc(replaced, spokenComparisonDotFragment)
	replaced = spokenSymbolReplacer.Replace(replaced)
	replaced = digitLetterBoundary.ReplaceAllString(replaced, "$1 $2")
	return letterDigitBoundary.ReplaceAllString(replaced, "$1 $2")
}

func spokenComparisonDotFragment(value string) string {
	match := comparisonDotFragmentPattern.FindStringSubmatch(value)
	if len(match) != 2 {
		return value
	}

	return " dot " + spokenComparisonDomainLabel(match[1], true, []string{match[1]})
}

func spokenComparisonEmail(value string) string {
	match := comparisonEmailPattern.FindStringSubmatch(value)
	if len(match) != 3 {
		return value
	}

	local := strings.NewReplacer(
		".", " dot ",
		"_", " underscore ",
		"-", " dash ",
		"+", " plus ",
	).Replace(match[1])

	return local + " at " + spokenComparisonDomain(match[2])
}

func spokenComparisonDomain(value string) string {
	domain := strings.Trim(value, ".,;:()[]{}<>\"'")
	wildcard := strings.HasPrefix(domain, "*.")
	domain = strings.TrimPrefix(domain, "*.")
	labels := strings.Split(domain, ".")
	words := make([]string, 0, len(labels)*2+2)
	if wildcard {
		words = append(words, "wildcard", "dot")
	}

	for index, label := range labels {
		if index > 0 {
			words = append(words, "dot")
		}
		words = append(words, spokenComparisonDomainLabel(label, index == len(labels)-1, labels))
	}

	return strings.Join(words, " ")
}

func spokenComparisonDomainLabel(label string, isTLD bool, labels []string) string {
	normalized := strings.ToLower(label)
	if normalized == "us" {
		return "U S"
	}
	if len(normalized) == 2 && strings.EqualFold(labels[len(labels)-1], "us") {
		return strings.Join(strings.Split(strings.ToUpper(normalized), ""), " ")
	}
	if isTLD && (normalized == "io" || normalized == "co") {
		return strings.Join(strings.Split(strings.ToUpper(normalized), ""), " ")
	}

	return strings.ReplaceAll(normalized, "-", " dash ")
}

func expandNormalizedWord(original string, normalized string) []string {
	if values := expandComparisonAcronym(original, normalized); len(values) > 0 {
		return values
	}

	if values, ok := unitAliases[normalized]; ok {
		return values
	}

	number, err := strconv.Atoi(normalized)
	if err != nil {
		return nil
	}

	words := numberToWords(number)
	if words == "" {
		return nil
	}

	values := strings.Fields(words)
	for index, value := range values {
		values[index] = normalizeSpokenWord(value)
	}
	if len(values) == 1 && values[0] == normalizeSpokenWord(original) {
		return nil
	}

	return values
}

func expandComparisonAcronym(original string, normalized string) []string {
	if _, ok := comparisonAcronyms[normalized]; !ok {
		return nil
	}

	values := make([]string, 0, len(normalized))
	for _, value := range normalized {
		if value >= 'a' && value <= 'z' {
			values = append(values, string(value))
		}
	}

	return values
}

func numberToWords(value int) string {
	if value < 0 || value > 9999 {
		return ""
	}
	if value < 20 {
		return smallNumberWords[value]
	}
	if value < 100 {
		tens := value / 10
		remainder := value % 10
		if remainder == 0 {
			return tensNumberWords[tens]
		}

		return tensNumberWords[tens] + " " + smallNumberWords[remainder]
	}
	if value < 1000 {
		hundreds := value / 100
		remainder := value % 100
		if remainder == 0 {
			return smallNumberWords[hundreds] + " hundred"
		}

		return smallNumberWords[hundreds] + " hundred " + numberToWords(remainder)
	}

	thousands := value / 1000
	remainder := value % 1000
	if remainder == 0 {
		return smallNumberWords[thousands] + " thousand"
	}

	return smallNumberWords[thousands] + " thousand " + numberToWords(remainder)
}

func commonPrefixLength(left []string, right []string) int {
	limit := min(len(left), len(right))
	for index := 0; index < limit; index++ {
		if left[index] != right[index] {
			return index
		}
	}

	return limit
}

func longestCommonSubsequenceLength(left []string, right []string) int {
	if len(left) == 0 || len(right) == 0 {
		return 0
	}

	previous := make([]int, len(right)+1)
	current := make([]int, len(right)+1)
	for _, leftValue := range left {
		for rightIndex, rightValue := range right {
			if leftValue == rightValue {
				current[rightIndex+1] = previous[rightIndex] + 1
			} else {
				current[rightIndex+1] = max(current[rightIndex], previous[rightIndex+1])
			}
		}
		previous, current = current, previous
		for index := range current {
			current[index] = 0
		}
	}

	return previous[len(right)]
}

var (
	nonWordPattern                = regexp.MustCompile(`[^a-z0-9]+`)
	digitLetterBoundary           = regexp.MustCompile(`([0-9])([A-Za-z])`)
	letterDigitBoundary           = regexp.MustCompile(`([A-Za-z])([0-9])`)
	comparisonTLDRPattern         = regexp.MustCompile(`(?i)\btl\s*;\s*dr\b`)
	comparisonUS3Pattern          = regexp.MustCompile(`(?i)\bus3\b`)
	comparisonWhoisPattern        = regexp.MustCompile(`(?i)\bwhois\b`)
	comparisonDashPattern         = regexp.MustCompile(`[-‐‑‒–—―]+`)
	comparisonDomainPattern       = regexp.MustCompile(`(?i)(\*\.)?([a-z0-9][a-z0-9-]*\.)+(us|org|com|net|edu|gov|io|dev|co)\b`)
	comparisonItalicDomainPattern = regexp.MustCompile(`(?i)\*((?:[a-z0-9][a-z0-9-]*\.)+(?:us|org|com|net|edu|gov|io|dev|co))\*`)
	comparisonEmailPattern        = regexp.MustCompile(`(?i)\b([a-z0-9._%+\-]+)@((?:[a-z0-9][a-z0-9-]*\.)+(?:us|org|com|net|edu|gov|io|dev|co))\b`)
	comparisonDotFragmentPattern  = regexp.MustCompile(`(?i)\.([a-z]{2,4})\b`)
	spokenSymbolReplacer          = strings.NewReplacer(
		"%", " percent ",
		"+", " plus ",
		"=", " equals ",
		"&", " and ",
	)
	comparisonAcronyms = map[string]struct{}{
		"asr":   {},
		"aws":   {},
		"cpu":   {},
		"dns":   {},
		"faq":   {},
		"ftp":   {},
		"gpu":   {},
		"html":  {},
		"http":  {},
		"https": {},
		"ip":    {},
		"tld":   {},
		"tts":   {},
		"url":   {},
		"us":    {},
		"usb":   {},
		"wa":    {},
	}
	optionalComparisonTokens = map[string]struct{}{
		"dash": {},
		"dot":  {},
	}
	unitAliases = map[string][]string{
		"gb":  {"gigabytes"},
		"kb":  {"kilobytes"},
		"mb":  {"megabytes"},
		"ms":  {"milliseconds"},
		"sec": {"seconds"},
		"tb":  {"terabytes"},
	}
	smallNumberWords = []string{
		"zero",
		"one",
		"two",
		"three",
		"four",
		"five",
		"six",
		"seven",
		"eight",
		"nine",
		"ten",
		"eleven",
		"twelve",
		"thirteen",
		"fourteen",
		"fifteen",
		"sixteen",
		"seventeen",
		"eighteen",
		"nineteen",
	}
	tensNumberWords = []string{
		"",
		"",
		"twenty",
		"thirty",
		"forty",
		"fifty",
		"sixty",
		"seventy",
		"eighty",
		"ninety",
	}
)
