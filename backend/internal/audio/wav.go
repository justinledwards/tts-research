package audio

import (
	"bytes"
	"encoding/binary"
	"errors"
	"math"
)

const (
	sampleRate        = 16_000
	bitsPerSample     = 16
	channelCount      = 1
	bytesPerSample    = bitsPerSample / 8
	riffHeaderID      = 0x46464952
	waveHeaderID      = 0x45564157
	formatChunkHeader = 0x20746d66
	dataChunkHeader   = 0x61746164
)

func DurationForText(text string) int {
	runeCount := runeLen(text)
	durationMS := 800 + runeCount*35

	return min(durationMS, 12_000)
}

func SilentWAV(durationMS int) ([]byte, error) {
	if durationMS <= 0 {
		return nil, errors.New("duration must be positive")
	}

	sampleCount := int(math.Ceil(float64(sampleRate) * float64(durationMS) / 1000))
	dataSize := sampleCount * channelCount * bytesPerSample
	buffer := bytes.NewBuffer(make([]byte, 0, 44+dataSize))

	writeString(buffer, "RIFF")
	writeUint32(buffer, 36+dataSize)
	writeString(buffer, "WAVE")
	writeString(buffer, "fmt ")
	writeUint32(buffer, 16)
	writeUint16(buffer, 1)
	writeUint16(buffer, channelCount)
	writeUint32(buffer, sampleRate)
	writeUint32(buffer, sampleRate*channelCount*bytesPerSample)
	writeUint16(buffer, channelCount*bytesPerSample)
	writeUint16(buffer, bitsPerSample)
	writeString(buffer, "data")
	writeUint32(buffer, dataSize)

	silence := make([]byte, dataSize)
	_, err := buffer.Write(silence)
	if err != nil {
		return nil, err
	}

	return buffer.Bytes(), nil
}

func SpeechLikeWAV(durationMS int) ([]byte, error) {
	if durationMS <= 0 {
		return nil, errors.New("duration must be positive")
	}

	sampleCount := int(math.Ceil(float64(sampleRate) * float64(durationMS) / 1000))
	data := make([]byte, sampleCount*channelCount*bytesPerSample)
	fadeSamples := max(1, sampleRate*24/1000)
	for sample := 0; sample < sampleCount; sample++ {
		remaining := sampleCount - sample - 1
		envelope := minFloat(1, minFloat(float64(sample)/float64(fadeSamples), float64(remaining)/float64(fadeSamples)))
		if envelope < 0 {
			envelope = 0
		}
		phase := 2 * math.Pi * 220 * float64(sample) / sampleRate
		value := int16(math.Round(math.Sin(phase) * 7200 * envelope))
		binary.LittleEndian.PutUint16(data[sample*bytesPerSample:], uint16(value))
	}

	return BuildPCM16WAV(data, WAVSpec{
		SampleRate:    sampleRate,
		ChannelCount:  channelCount,
		BitsPerSample: bitsPerSample,
	}), nil
}

type WAVSpec struct {
	SampleRate    int
	ChannelCount  int
	BitsPerSample int
}

func ConcatWAV(chunks [][]byte) ([]byte, WAVSpec, error) {
	if len(chunks) == 0 {
		return nil, WAVSpec{}, errors.New("at least one WAV chunk is required")
	}

	var spec WAVSpec
	pcmChunks := make([][]byte, 0, len(chunks))
	totalDataBytes := 0
	for index, chunk := range chunks {
		chunkSpec, data, err := ParsePCM16WAV(chunk)
		if err != nil {
			return nil, WAVSpec{}, err
		}
		if index == 0 {
			spec = chunkSpec
		} else if spec != chunkSpec {
			return nil, WAVSpec{}, errors.New("WAV chunks must share the same audio format")
		}
		pcmChunks = append(pcmChunks, data)
		totalDataBytes += len(data)
	}

	pcmData := make([]byte, 0, totalDataBytes)
	for _, data := range pcmChunks {
		pcmData = append(pcmData, data...)
	}

	return BuildPCM16WAV(pcmData, spec), spec, nil
}

func DurationMSForWAVData(dataBytes int, spec WAVSpec) int {
	if spec.SampleRate <= 0 || spec.ChannelCount <= 0 || spec.BitsPerSample <= 0 {
		return 0
	}

	bytesPerFrame := spec.ChannelCount * spec.BitsPerSample / 8
	if bytesPerFrame <= 0 {
		return 0
	}

	frames := dataBytes / bytesPerFrame
	return int(math.Round(float64(frames) / float64(spec.SampleRate) * 1000))
}

func TrimPCM16WAV(chunk []byte, maxDurationMS int) ([]byte, WAVSpec, int, bool, error) {
	spec, data, err := ParsePCM16WAV(chunk)
	if err != nil {
		return nil, WAVSpec{}, 0, false, err
	}

	durationMS := DurationMSForWAVData(len(data), spec)
	if maxDurationMS <= 0 || durationMS <= maxDurationMS {
		output := make([]byte, len(chunk))
		copy(output, chunk)
		return output, spec, durationMS, false, nil
	}

	bytesPerFrame := spec.ChannelCount * spec.BitsPerSample / 8
	if bytesPerFrame <= 0 || spec.SampleRate <= 0 {
		return nil, WAVSpec{}, 0, false, errors.New("WAV spec cannot be trimmed")
	}

	maxFrames := int(math.Round(float64(spec.SampleRate) * float64(maxDurationMS) / 1000))
	maxBytes := maxFrames * bytesPerFrame
	if maxBytes > len(data) {
		maxBytes = len(data)
	}
	maxBytes -= maxBytes % bytesPerFrame
	if maxBytes <= 0 {
		return nil, WAVSpec{}, 0, false, errors.New("trimmed WAV would be empty")
	}

	trimmedData := make([]byte, maxBytes)
	copy(trimmedData, data[:maxBytes])
	return BuildPCM16WAV(trimmedData, spec), spec, DurationMSForWAVData(maxBytes, spec), true, nil
}

func ParsePCM16WAV(chunk []byte) (WAVSpec, []byte, error) {
	if len(chunk) < 44 {
		return WAVSpec{}, nil, errors.New("WAV chunk is too short")
	}
	if binary.LittleEndian.Uint32(chunk[0:4]) != riffHeaderID || binary.LittleEndian.Uint32(chunk[8:12]) != waveHeaderID {
		return WAVSpec{}, nil, errors.New("WAV chunk is not RIFF/WAVE")
	}

	var spec WAVSpec
	var data []byte
	cursor := 12
	for cursor+8 <= len(chunk) {
		chunkID := binary.LittleEndian.Uint32(chunk[cursor : cursor+4])
		chunkSize := int(binary.LittleEndian.Uint32(chunk[cursor+4 : cursor+8]))
		cursor += 8
		if cursor+chunkSize > len(chunk) {
			return WAVSpec{}, nil, errors.New("WAV subchunk exceeds file length")
		}

		switch chunkID {
		case formatChunkHeader:
			if chunkSize < 16 {
				return WAVSpec{}, nil, errors.New("WAV fmt chunk is too short")
			}
			audioFormat := binary.LittleEndian.Uint16(chunk[cursor : cursor+2])
			if audioFormat != 1 {
				return WAVSpec{}, nil, errors.New("only PCM WAV chunks are supported")
			}
			spec.ChannelCount = int(binary.LittleEndian.Uint16(chunk[cursor+2 : cursor+4]))
			spec.SampleRate = int(binary.LittleEndian.Uint32(chunk[cursor+4 : cursor+8]))
			spec.BitsPerSample = int(binary.LittleEndian.Uint16(chunk[cursor+14 : cursor+16]))
			if spec.BitsPerSample != 16 {
				return WAVSpec{}, nil, errors.New("only 16-bit WAV chunks are supported")
			}
		case dataChunkHeader:
			data = chunk[cursor : cursor+chunkSize]
		}

		cursor += chunkSize
		if chunkSize%2 == 1 {
			cursor++
		}
	}

	if spec.SampleRate == 0 || spec.ChannelCount == 0 || len(data) == 0 {
		return WAVSpec{}, nil, errors.New("WAV chunk is missing fmt or data")
	}

	return spec, data, nil
}

func BuildPCM16WAV(data []byte, spec WAVSpec) []byte {
	buffer := bytes.NewBuffer(make([]byte, 0, 44+len(data)))

	writeString(buffer, "RIFF")
	writeUint32(buffer, 36+len(data))
	writeString(buffer, "WAVE")
	writeString(buffer, "fmt ")
	writeUint32(buffer, 16)
	writeUint16(buffer, 1)
	writeUint16(buffer, spec.ChannelCount)
	writeUint32(buffer, spec.SampleRate)
	writeUint32(buffer, spec.SampleRate*spec.ChannelCount*spec.BitsPerSample/8)
	writeUint16(buffer, spec.ChannelCount*spec.BitsPerSample/8)
	writeUint16(buffer, spec.BitsPerSample)
	writeString(buffer, "data")
	writeUint32(buffer, len(data))
	_, _ = buffer.Write(data)

	return buffer.Bytes()
}

func runeLen(value string) int {
	count := 0
	for range value {
		count += 1
	}
	return count
}

func minFloat(left float64, right float64) float64 {
	if left < right {
		return left
	}
	return right
}

func writeString(buffer *bytes.Buffer, value string) {
	_, _ = buffer.WriteString(value)
}

func writeUint16(buffer *bytes.Buffer, value int) {
	_ = binary.Write(buffer, binary.LittleEndian, uint16(value))
}

func writeUint32(buffer *bytes.Buffer, value int) {
	_ = binary.Write(buffer, binary.LittleEndian, uint32(value))
}
