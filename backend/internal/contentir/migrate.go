package contentir

import (
	"errors"
	"fmt"
	"strings"
)

var ErrUnsupportedSchemaVersion = errors.New("unsupported content IR schema version")

func Migrate(document Document) (Document, error) {
	version := strings.TrimSpace(document.SchemaVersion)
	switch version {
	case SchemaVersion:
		return document, nil
	case "":
		return Document{}, fmt.Errorf("%w: missing schemaVersion", ErrUnsupportedSchemaVersion)
	default:
		return Document{}, fmt.Errorf("%w: %s", ErrUnsupportedSchemaVersion, version)
	}
}
