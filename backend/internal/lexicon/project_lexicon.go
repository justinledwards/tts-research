package lexicon

import "path/filepath"

const LexiconFilename = "lexicon.json"

func ProjectStore(projectDataDir string, projectID string) Store {
	return Store{
		Path:    filepath.Join(projectDataDir, projectID, LexiconFilename),
		Scope:   ScopeProject,
		OwnerID: projectID,
	}
}
