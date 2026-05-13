package audio

import (
	"bytes"
	"encoding/binary"
	"errors"
	"math"
)

const (
	sampleRate     = 16_000
	bitsPerSample  = 16
	channelCount   = 1
	bytesPerSample = bitsPerSample / 8
)

func DurationForText(text string) int {
	runeCount := len([]rune(text))
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
	var pcm bytes.Buffer
	for index, chunk := range chunks {
		chunkSpec, data, err := parsePCM16WAV(chunk)
		if err != nil {
			return nil, WAVSpec{}, err
		}
		if index == 0 {
			spec = chunkSpec
		} else if spec != chunkSpec {
			return nil, WAVSpec{}, errors.New("WAV chunks must share the same audio format")
		}
		if _, err := pcm.Write(data); err != nil {
			return nil, WAVSpec{}, err
		}
	}

	return buildPCM16WAV(pcm.Bytes(), spec), spec, nil
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

func parsePCM16WAV(chunk []byte) (WAVSpec, []byte, error) {
	if len(chunk) < 44 {
		return WAVSpec{}, nil, errors.New("WAV chunk is too short")
	}
	if string(chunk[0:4]) != "RIFF" || string(chunk[8:12]) != "WAVE" {
		return WAVSpec{}, nil, errors.New("WAV chunk is not RIFF/WAVE")
	}

	var spec WAVSpec
	var data []byte
	cursor := 12
	for cursor+8 <= len(chunk) {
		chunkID := string(chunk[cursor : cursor+4])
		chunkSize := int(binary.LittleEndian.Uint32(chunk[cursor+4 : cursor+8]))
		cursor += 8
		if cursor+chunkSize > len(chunk) {
			return WAVSpec{}, nil, errors.New("WAV subchunk exceeds file length")
		}

		switch chunkID {
		case "fmt ":
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
		case "data":
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

func buildPCM16WAV(data []byte, spec WAVSpec) []byte {
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

func writeString(buffer *bytes.Buffer, value string) {
	_, _ = buffer.WriteString(value)
}

func writeUint16(buffer *bytes.Buffer, value int) {
	_ = binary.Write(buffer, binary.LittleEndian, uint16(value))
}

func writeUint32(buffer *bytes.Buffer, value int) {
	_ = binary.Write(buffer, binary.LittleEndian, uint32(value))
}
