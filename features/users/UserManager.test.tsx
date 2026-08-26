import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { UserManager } from "./UserManager";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u2" } }, status: "authenticated" }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = fetchMock;
});

function renderManager() {
  return render(
    <I18nProvider initialLocale="es">
      <UserManager />
    </I18nProvider>,
  );
}

function usersPayload() {
  return [
    { id: "u1", email: "a@test.local", name: "Coach A", role: "user", plan: "free" },
    { id: "u2", email: "b@test.local", name: "Coach B", role: "developer", plan: "club" },
  ];
}

describe("UserManager (RAU-52 dev section)", () => {
  it("lists accounts with role and plan selects", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => usersPayload(),
    });
    renderManager();

    await waitFor(() => expect(screen.getByText("Coach A")).toBeTruthy());
    expect(screen.getByText("a@test.local")).toBeTruthy();
    expect(screen.getByText("Coach B")).toBeTruthy();

    const roleSelect = screen.getByRole("combobox", { name: "Cambiar rol de a@test.local" }) as HTMLSelectElement;
    expect(roleSelect.value).toBe("user");
    const planSelect = screen.getByRole("combobox", { name: "Cambiar plan de a@test.local" }) as HTMLSelectElement;
    expect(planSelect.value).toBe("free");
  });

  it("PATCHes the new plan and reflects it in the row", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => usersPayload(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "u1", email: "a@test.local", name: "Coach A", role: "user", plan: "club" }),
      });
    renderManager();

    await waitFor(() => expect(screen.getByText("Coach A")).toBeTruthy());

    const planSelect = screen.getByRole("combobox", { name: "Cambiar plan de a@test.local" }) as HTMLSelectElement;
    fireEvent.change(planSelect, { target: { value: "club" } });

    await waitFor(() => expect(planSelect.value).toBe("club"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dev/users/u1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ plan: "club" }),
      }),
    );
  });

  it("shows a save error and reloads when the PATCH fails", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => usersPayload(),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "plan must be one of: free, club, premium" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => usersPayload(),
      });
    renderManager();

    await waitFor(() => expect(screen.getByText("Coach A")).toBeTruthy());

    const planSelect = screen.getByRole("combobox", { name: "Cambiar plan de a@test.local" }) as HTMLSelectElement;
    fireEvent.change(planSelect, { target: { value: "club" } });

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("plan must be one of");
  });
});
