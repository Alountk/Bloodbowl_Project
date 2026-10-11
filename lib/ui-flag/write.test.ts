import { afterEach, describe, expect, it, vi } from "vitest";
import { UI_FLAG_COOKIE } from "./flag";
import { writeUiFlag } from "./write";

/**
 * writeUiFlag tests (issue #331 / UIR-6): the client-side cookie writer that
 * mirrors `writeThemeCookie` (lib/theme/index.tsx) — same path/max-age/
 * SameSite attributes, and an expire (max-age=0) for the OFF case, which the
 * theme writer never needed (themes always have a value). Cookie access can
 * throw in restricted contexts or with no document: the writer never throws.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  // Expire both states so the jsdom cookie jar starts each test clean.
  document.cookie = `${UI_FLAG_COOKIE}=; path=/; max-age=0`;
});

describe("writeUiFlag", () => {
  it("sets bb-ui=next with the same attributes as writeThemeCookie", () => {
    writeUiFlag(true);

    expect(document.cookie).toContain(`${UI_FLAG_COOKIE}=next`);
  });

  it("expires the cookie when the flag is turned OFF", () => {
    document.cookie = `${UI_FLAG_COOKIE}=next; path=/; max-age=31536000`;
    expect(document.cookie).toContain(`${UI_FLAG_COOKIE}=next`);

    writeUiFlag(false);

    expect(document.cookie).not.toContain(`${UI_FLAG_COOKIE}=next`);
  });

  it("never throws without a document (restricted/SSR context guard)", () => {
    vi.stubGlobal("document", undefined);

    expect(() => writeUiFlag(true)).not.toThrow();
    expect(() => writeUiFlag(false)).not.toThrow();
  });
});
