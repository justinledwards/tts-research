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

Implementation helpers live in backend `contentir` locator codecs and frontend `locatorCodecs.ts`; serializers should call those helpers instead of matching every format locally.
