package lexicon

import "path/filepath"

func VoiceProfileStore(profileDataDir string, profileID string) Store {
	return Store{
		Path:    filepath.Join(profileDataDir, profileID, LexiconFilename),
		Scope:   ScopeVoiceProfile,
		OwnerID: profileID,
	}
}
