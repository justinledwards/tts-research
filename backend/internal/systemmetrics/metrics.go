package systemmetrics

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

type GpuMetric struct {
	Index              int     `json:"index"`
	Name               string  `json:"name"`
	UUID               string  `json:"uuid"`
	UtilizationGpuPct  float64 `json:"utilizationGpuPct"`
	UtilizationMemPct  float64 `json:"utilizationMemPct"`
	MemoryTotalMiB     int64   `json:"memoryTotalMiB"`
	MemoryUsedMiB      int64   `json:"memoryUsedMiB"`
	MemoryFreeMiB      int64   `json:"memoryFreeMiB"`
	PowerDrawW         float64 `json:"powerDrawW"`
	PowerLimitW        float64 `json:"powerLimitW"`
	TemperatureCelsius float64 `json:"temperatureCelsius"`
}

type ProcessMetrics struct {
	PID             int    `json:"pid"`
	Threads         int    `json:"threads"`
	RssBytes        int64  `json:"rssBytes"`
	VmSizeBytes     int64  `json:"vmSizeBytes"`
	WorkingDir      string `json:"workingDir"`
	Runtime         string `json:"runtime"`
	NumGoroutines   int    `json:"numGoroutines"`
	HeapAllocBytes  int64  `json:"heapAllocBytes"`
	TotalAllocBytes int64  `json:"totalAllocBytes"`
	SysBytes        int64  `json:"sysBytes"`
}

type HostMetrics struct {
	Hostname          string  `json:"hostname"`
	GoMaxProcs        int     `json:"goMaxProcs"`
	CPUCount          int     `json:"cpuCount"`
	OS                string  `json:"os"`
	Kernel            string  `json:"kernel"`
	SwapFreeBytes     int64   `json:"swapFreeBytes"`
	SwapTotalBytes    int64   `json:"swapTotalBytes"`
	MemTotalBytes     int64   `json:"memTotalBytes"`
	MemAvailableBytes int64   `json:"memAvailableBytes"`
	LoadAvg1          float64 `json:"loadAvg1"`
	LoadAvg5          float64 `json:"loadAvg5"`
	LoadAvg15         float64 `json:"loadAvg15"`
}

type Snapshot struct {
	CollectedAt    string         `json:"collectedAt"`
	ServiceVersion string         `json:"serviceVersion"`
	Gpus           []GpuMetric    `json:"gpus"`
	Warnings       []string       `json:"warnings"`
	Process        ProcessMetrics `json:"process"`
	Host           HostMetrics    `json:"host"`
}

type cache struct {
	pid    int
	locked sync.Mutex
}

var packageCache = &cache{
	pid: -1,
}

func Collect(serviceVersion string) Snapshot {
	packageCache.locked.Lock()
	pid := packageCache.pid
	packageCache.locked.Unlock()
	if pid <= 0 {
		pid = os.Getpid()
		packageCache.locked.Lock()
		packageCache.pid = pid
		packageCache.locked.Unlock()
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	var warnings []string

	host, hostWarnings := collectHostMetrics()
	if len(hostWarnings) > 0 {
		warnings = append(warnings, hostWarnings...)
	}
	process := collectProcessMetrics(pid)
	gpus := collectGPUStats()
	if gpusError := gpus.err; gpusError != nil {
		warnings = append(warnings, gpusError.Error())
		gpus.entries = nil
	}

	snapshot := Snapshot{
		CollectedAt:    now,
		ServiceVersion: serviceVersion,
		Process:        process,
		Host:           host,
		Gpus:           gpus.entries,
		Warnings:       warnings,
	}

	return snapshot
}

type gpuResult struct {
	entries []GpuMetric
	err     error
}

func collectGPUStats() gpuResult {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	commandPath, commandErr := exec.LookPath("nvidia-smi")
	if commandErr != nil {
		return gpuResult{
			err: fmt.Errorf("nvidia-smi unavailable: %w", commandErr),
		}
	}

	cmd := exec.CommandContext(
		ctx,
		commandPath,
		"--query-gpu=index,name,uuid,utilization.gpu,utilization.memory,memory.total,memory.used,memory.free,power.draw,power.limit,temperature.gpu",
		"--format=csv,noheader,nounits",
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return gpuResult{
			err: fmt.Errorf("nvidia-smi failed: %w: %s", err, strings.TrimSpace(string(output))),
		}
	}

	rows := parseCSVRows(output)

	metrics := make([]GpuMetric, 0, len(rows))
	for _, row := range rows {
		if len(row) < 11 {
			continue
		}

		index, err := strconv.Atoi(strings.TrimSpace(row[0]))
		if err != nil {
			continue
		}
		metric := GpuMetric{
			Index:              index,
			Name:               strings.TrimSpace(row[1]),
			UUID:               strings.TrimSpace(row[2]),
			UtilizationGpuPct:  parseFloatOrZero(row[3]),
			UtilizationMemPct:  parseFloatOrZero(row[4]),
			MemoryTotalMiB:     parseIntOrZero(row[5]),
			MemoryUsedMiB:      parseIntOrZero(row[6]),
			MemoryFreeMiB:      parseIntOrZero(row[7]),
			PowerDrawW:         parseFloatOrZero(row[8]),
			PowerLimitW:        parseFloatOrZero(row[9]),
			TemperatureCelsius: parseFloatOrZero(row[10]),
		}
		metrics = append(metrics, metric)
	}

	return gpuResult{entries: metrics}
}

func parseCSVRows(output []byte) [][]string {
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	rows := make([][]string, 0, len(lines))
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		rows = append(rows, splitCSVLine(line))
	}
	return rows
}

func splitCSVLine(line string) []string {
	values := make([]string, 0, 12)
	var current strings.Builder
	inQuotes := false
	for index := 0; index < len(line); index++ {
		character := line[index]
		switch character {
		case '"':
			if inQuotes && index+1 < len(line) && line[index+1] == '"' {
				current.WriteByte('"')
				index++
				continue
			}
			inQuotes = !inQuotes
		case ',':
			if inQuotes {
				current.WriteByte(character)
				continue
			}
			values = append(values, strings.TrimSpace(current.String()))
			current.Reset()
		default:
			current.WriteByte(character)
		}
	}
	values = append(values, strings.TrimSpace(current.String()))
	return values
}

func collectHostMetrics() (HostMetrics, []string) {
	hostname, _ := os.Hostname()
	var memTotal int64
	var memAvailable int64
	var swapTotal int64
	var swapFree int64
	var warnings []string

	hostLoad := parseLoadAvg()
	memInfo, err := os.ReadFile("/proc/meminfo")
	if err == nil {
		memTotal = parseProcKB(memInfo, "MemTotal")
		memAvailable = parseProcKB(memInfo, "MemAvailable")
		swapTotal = parseProcKB(memInfo, "SwapTotal")
		swapFree = parseProcKB(memInfo, "SwapFree")
	} else {
		warnings = append(warnings, "Host memory information unavailable from /proc/meminfo")
	}

	kernel := "unknown"
	if unameOut, err := exec.Command("uname", "-sr").Output(); err == nil {
		kernel = strings.TrimSpace(string(unameOut))
	}

	return HostMetrics{
		Hostname:          hostname,
		GoMaxProcs:        runtime.GOMAXPROCS(0),
		CPUCount:          runtime.NumCPU(),
		OS:                runtime.GOOS,
		Kernel:            kernel,
		SwapFreeBytes:     swapFree * 1024,
		SwapTotalBytes:    swapTotal * 1024,
		MemTotalBytes:     memTotal * 1024,
		MemAvailableBytes: memAvailable * 1024,
		LoadAvg1:          hostLoad[0],
		LoadAvg5:          hostLoad[1],
		LoadAvg15:         hostLoad[2],
	}, warnings
}

func collectProcessMetrics(pid int) ProcessMetrics {
	pid = absInt(pid)
	if pid <= 0 {
		pid = os.Getpid()
	}
	runtimeStat := &runtime.MemStats{}
	runtime.ReadMemStats(runtimeStat)

	threads := 0
	rssBytes := int64(0)
	vmSizeBytes := int64(0)

	statusPath := filepath.Join("/proc/self/status")
	if pid > 0 && pid != os.Getpid() {
		statusPath = filepath.Join("/", "proc", strconv.Itoa(pid), "status")
	}
	statusText, err := os.ReadFile(statusPath)
	if err == nil {
		threads = int(parseProcInt(statusText, "Threads"))
		rssKib := parseProcMemKB(statusText, "VmRSS")
		vmSizeKib := parseProcMemKB(statusText, "VmSize")
		rssBytes = rssKib * 1024
		vmSizeBytes = vmSizeKib * 1024
	}

	workDir, _ := os.Getwd()
	runtimeName := runtime.Version()

	return ProcessMetrics{
		PID:             pid,
		Threads:         threads,
		RssBytes:        rssBytes,
		VmSizeBytes:     vmSizeBytes,
		WorkingDir:      workDir,
		Runtime:         runtimeName,
		NumGoroutines:   runtime.NumGoroutine(),
		HeapAllocBytes:  int64(runtimeStat.HeapAlloc),
		TotalAllocBytes: int64(runtimeStat.TotalAlloc),
		SysBytes:        int64(runtimeStat.Sys),
	}
}

func parseLoadAvg() [3]float64 {
	content, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return [3]float64{}
	}

	fields := strings.Fields(string(content))
	if len(fields) < 3 {
		return [3]float64{}
	}

	return [3]float64{
		parseFloatOrZero(fields[0]),
		parseFloatOrZero(fields[1]),
		parseFloatOrZero(fields[2]),
	}
}

func parseProcKB(raw []byte, key string) int64 {
	prefix := key + ":"
	for _, line := range bytes.Split(raw, []byte{'\n'}) {
		if !bytes.HasPrefix(line, []byte(prefix)) {
			continue
		}
		parts := strings.Fields(string(line))
		if len(parts) < 2 {
			continue
		}
		return parseInt64OrZero(parts[1])
	}
	return 0
}

func parseProcMemKB(raw []byte, key string) int64 {
	return parseProcKB(raw, key)
}

func parseProcInt(raw []byte, key string) int64 {
	prefix := key + ":"
	for _, line := range bytes.Split(raw, []byte{'\n'}) {
		if !bytes.HasPrefix(line, []byte(prefix)) {
			continue
		}
		parts := strings.Fields(string(line))
		if len(parts) < 2 {
			return 0
		}
		return parseInt64OrZero(parts[1])
	}
	return 0
}

func parseInt64OrZero(raw string) int64 {
	value, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
	if err != nil {
		return 0
	}
	return value
}

func parseFloatOrZero(raw string) float64 {
	value, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	if err != nil {
		return 0
	}
	return value
}

func parseIntOrZero(raw string) int64 {
	return parseInt64OrZero(raw)
}

func absInt(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
