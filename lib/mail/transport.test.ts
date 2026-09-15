import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createConsoleTransport,
  createResendTransport,
  type MailMessage,
} from "./transport";

const message: MailMessage = {
  to: "coach@example.com",
  subject: "Nueva fecha",
  html: "<p>hola</p>",
  text: "hola",
};

/** Captures the structured line the console transport writes. */
function captureConsole() {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation(((line: string) => {
    lines.push(line);
  }) as never);
  return { lines, restore: () => spy.mockRestore() };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createResendTransport", () => {
  it("POSTs the message to Resend with bearer auth and a JSON body", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const transport = createResendTransport("key-123", "BB <no-reply@x.com>");

    await transport.send(message);

    expect(transport.name).toBe("resend");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer key-123",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      from: "BB <no-reply@x.com>",
      to: "coach@example.com",
      subject: "Nueva fecha",
      html: "<p>hola</p>",
      text: "hola",
    });
    // The call is bounded so a hung provider cannot hold the caller open.
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws with the status on a non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422 });
    const transport = createResendTransport("key-123", "no-reply@x.com");

    await expect(transport.send(message)).rejects.toThrow("422");
  });

  it("propagates a network failure from fetch", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const transport = createResendTransport("key-123", "no-reply@x.com");

    await expect(transport.send(message)).rejects.toThrow("ECONNRESET");
  });
});

describe("createConsoleTransport", () => {
  it("logs one mail.sent line and never touches the network", async () => {
    const consoleCapture = captureConsole();
    const transport = createConsoleTransport();

    await transport.send(message);

    expect(transport.name).toBe("console");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleCapture.lines).toHaveLength(1);
    expect(JSON.parse(consoleCapture.lines[0])).toMatchObject({
      event: "mail.sent",
      transport: "console",
      to: "coach@example.com",
      subject: "Nueva fecha",
    });
    consoleCapture.restore();
  });
});
