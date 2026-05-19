import { describe, expect, it } from "vitest";
import { teleprompterLinkToken } from "./App";

describe("teleprompterLinkToken", () => {
  it("preserves surrounding parentheses as leading/trailing text", () => {
    const result = teleprompterLinkToken("(https://example.com).");

    expect(result).toEqual({
      href: "https://example.com",
      label: "https://example.com",
      leading: "(",
      trailing: ").",
    });
  });

  it("normalizes www links with punctuation trimming", () => {
    const result = teleprompterLinkToken("[www.example.com],");

    expect(result).toEqual({
      href: "https://www.example.com",
      label: "www.example.com",
      leading: "[",
      trailing: "],",
    });
  });

  it("handles non-links as non-matches", () => {
    expect(teleprompterLinkToken("not-a-link.")).toBeNull();
    expect(teleprompterLinkToken("https://")).toBeNull();
  });
});
