import { describe, expect, it } from "vitest";
import { ApiRequestError, isApiNotFoundError } from "./api";

describe("API errors", () => {
  it("identifies structured 404 errors for stale local source state", () => {
    expect(isApiNotFoundError(new ApiRequestError(404, "not found"))).toBe(true);
    expect(isApiNotFoundError(new ApiRequestError(500, "server error"))).toBe(false);
  });
});
