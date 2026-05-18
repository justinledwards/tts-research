# Locator Contracts

The contract separates three locator layers:

- internal provenance locators: format-specific extraction coordinates in Content IR;
- Readium locators: public, shareable locator objects for reader interoperability;
- locator envelopes: stable app envelopes for resume, bookmarks, and highlights.

`locator-envelope.v1` stores:

- `kind`: `resume`, `bookmark`, or `highlight`;
- `sourceId`, optional `nodeId`, `scopeKey`, and `activeWordIndex`;
- the internal Content IR locator;
- optional Readium locator export;
- `textQuote` context for fuzzy recovery.

Readium exports use `href`, `type`, `locations`, and `text`. EPUB exports include XHTML `href`, `application/xhtml+xml`, progression where known, fragment/CSS selector where known, and `partialCfi` when a CFI is available. PDF exports use `page` and optional `viewrect` fragments.

Backend import/export helpers live in `backend/internal/contentir/readiumbridge`; serializers should call that package instead of matching every format locally. Frontend reader helpers are exposed through `frontend/src/content-ir.ts`, with `locatorCodecs.ts` kept as the private implementation.

## Examples

Import a reader locator by converting the Readium object through the backend bridge, then storing the resulting `locator-envelope.v1` beside the project/book state.

Resume from an exported envelope by resolving the internal locator first, then falling back to `activeWordIndex` and `textQuote` if the exact locator is not present in the current timing map.

```json
{
  "schemaVersion": "locator-envelope.v1",
  "kind": "resume",
  "sourceId": "contract-epub",
  "nodeId": "epub-0001",
  "activeWordIndex": 0,
  "locator": {
    "type": "epub",
    "epub": {
      "href": "OPS/chapter-one.xhtml",
      "fragment": "p1"
    }
  },
  "readium": {
    "href": "OPS/chapter-one.xhtml",
    "type": "application/xhtml+xml",
    "locations": {
      "fragments": ["p1"],
      "cssSelector": "#p1"
    }
  },
  "textQuote": "Opening chapter text."
}
```

Restore a highlight after project export/import by comparing the envelope `locator` against timing/highlight tokens. If the source was regenerated and exact coordinates moved, use `textQuote` as fuzzy context and keep `nodeId` as the stable preferred anchor.
