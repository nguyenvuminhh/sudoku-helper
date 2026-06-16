import { afterEach, describe, expect, it, vi } from "vitest";

import { requestGeneratedPuzzle } from "./api";

describe("api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a generated puzzle for the given level", async () => {
    const payload = {
      puzzle: "0".repeat(81),
      solution: "1".repeat(81),
      level: { id: "easy", name: "Easy", description: "", techniques: [] },
      requested_level: { id: "easy", name: "Easy", description: "", techniques: [] },
      se_rating: 1.2,
      techniques: [],
      technique_profile: {},
      attribution: { name: "l2sg", url: "", license: "MIT", copyright: "" }
    };
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" }, status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestGeneratedPuzzle("easy");

    const requestInit = fetchMock.mock.calls[0][1];
    const requestBody = JSON.parse(requestInit?.body as string);
    expect(requestBody.level).toBe("easy");
    expect(result.puzzle).toBe("0".repeat(81));
  });
});
