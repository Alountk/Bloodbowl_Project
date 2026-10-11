import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UiFlagProvider, useUiFlag } from "./index";

/**
 * ui-refresh UIR-1 provider tests, mirroring `lib/theme/index.test.tsx`: the
 * provider seeds the flag from the RSC-serialized `initialUiFlag` the root
 * layout resolved from the `bb-ui` cookie, and `useUiFlag()` falls back to
 * `false` (legacy) with no provider — the `useTheme` fallback semantics.
 */

function Probe() {
  const uiFlag = useUiFlag();
  return <span data-testid="ui-flag">{String(uiFlag)}</span>;
}

function renderFlag(initialUiFlag?: boolean) {
  if (initialUiFlag === undefined) return render(<Probe />);
  return render(
    <UiFlagProvider initialUiFlag={initialUiFlag}>
      <Probe />
    </UiFlagProvider>,
  );
}

describe("useUiFlag without a provider", () => {
  it("falls back to false (legacy)", () => {
    renderFlag();
    expect(screen.getByTestId("ui-flag").textContent).toBe("false");
  });
});

describe("UiFlagProvider", () => {
  it("honors a true SSR seed (bb-ui=next)", () => {
    renderFlag(true);
    expect(screen.getByTestId("ui-flag").textContent).toBe("true");
  });

  it("honors a false seed (flag OFF)", () => {
    renderFlag(false);
    expect(screen.getByTestId("ui-flag").textContent).toBe("false");
  });

  it("treats an omitted seed as OFF (standalone mount)", () => {
    render(
      <UiFlagProvider>
        <Probe />
      </UiFlagProvider>,
    );
    expect(screen.getByTestId("ui-flag").textContent).toBe("false");
  });
});
