package audio

import (
	"encoding/binary"
	"testing"
)

func TestSpeechLikeWAVHasEnergyAndFadeGuards(t *testing.T) {
	wav, err := SpeechLikeWAV(1000)
	if err != nil {
		t.Fatalf("SpeechLikeWAV returned error: %v", err)
	}
	spec, pcm, err := ParsePCM16WAV(wav)
	if err != nil {
		t.Fatalf("ParsePCM16WAV returned error: %v", err)
	}
	if spec.SampleRate != sampleRate || spec.ChannelCount != channelCount || spec.BitsPerSample != bitsPerSample {
		t.Fatalf("spec = %+v, want default mono PCM16", spec)
	}
	if len(pcm) == 0 {
		t.Fatal("speech-like WAV had no PCM data")
	}
	if pcm[0] != 0 {
		t.Fatalf("first sample = %d, want fade-in from zero", pcm[0])
	}
	if pcm[len(pcm)-1] != 0 {
		t.Fatalf("last sample = %d, want fade-out to zero", pcm[len(pcm)-1])
	}
	if peakPCM16(pcm) == 0 {
		t.Fatal("speech-like WAV was silent")
	}
}

func peakPCM16(pcm []byte) int16 {
	var peak int16
	for index := 0; index+1 < len(pcm); index += 2 {
		value := int16(binary.LittleEndian.Uint16(pcm[index:]))
		if value < 0 {
			value = -value
		}
		if value > peak {
			peak = value
		}
	}
	return peak
}
