package contentir

type SpeechPolicyHint struct {
	Mode          string `json:"mode"`
	Emphasis      string `json:"emphasis"`
	PauseBeforeMS int    `json:"pauseBeforeMs"`
	PauseAfterMS  int    `json:"pauseAfterMs"`
}

func NewSpeechPolicyHint(mode string, emphasis string, pauseBeforeMS int, pauseAfterMS int) SpeechPolicyHint {
	if mode == "" {
		mode = "speak"
	}
	return SpeechPolicyHint{
		Mode:          mode,
		Emphasis:      emphasis,
		PauseBeforeMS: pauseBeforeMS,
		PauseAfterMS:  pauseAfterMS,
	}
}
