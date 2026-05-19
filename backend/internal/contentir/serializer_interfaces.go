package contentir

import (
	"encoding/json"
	"io"
)

type Encoder interface {
	Encode(Document) ([]byte, error)
}

type Decoder interface {
	Decode([]byte) (Document, error)
}

type Serializer interface {
	Encoder
	Decoder
}

type JSONSerializer struct{}

func (JSONSerializer) Encode(document Document) ([]byte, error) {
	encoded, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(encoded, '\n'), nil
}

func (JSONSerializer) Decode(data []byte) (Document, error) {
	var document Document
	if err := json.Unmarshal(data, &document); err != nil {
		return Document{}, err
	}
	return Migrate(document)
}

func DecodeJSON(reader io.Reader) (Document, error) {
	data, err := io.ReadAll(reader)
	if err != nil {
		return Document{}, err
	}
	return JSONSerializer{}.Decode(data)
}
