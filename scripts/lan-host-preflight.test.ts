import { describe, expect, it } from "vitest";
import {
  LAN_HOST,
  LAN_HOST_TEST_TITLE,
  lanHostTitlePattern,
  planLanHostPreflight,
  probeCommand,
} from "./lan-host-preflight";

describe("lan-host preflight (e2e)", () => {
  it("keeps the LAN test when the loopback alias is configured", () => {
    const plan = planLanHostPreflight({
      probeOutput: `lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST> mtu 16384
\tinet 127.0.0.1 netmask 0xff000000
\tinet 111.111.111.100 netmask 255.255.255.255`,
      isCI: false,
    });
    expect(plan.excluded).toBe(false);
    expect(plan.message).toBeUndefined();
  });

  it("keeps the LAN test for the Linux CI probe output", () => {
    const plan = planLanHostPreflight({
      probeOutput: `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536
    inet 127.0.0.1/8 scope host lo
    inet 111.111.111.100/32 scope host lo`,
      isCI: true,
    });
    expect(plan.excluded).toBe(false);
    expect(plan.message).toBeUndefined();
  });

  it("excludes the LAN test locally when the alias is missing, with the exact macOS fix", () => {
    const plan = planLanHostPreflight({ probeOutput: null, isCI: false });
    expect(plan.excluded).toBe(true);
    expect(plan.message).toContain(
      "sudo ifconfig lo0 alias 111.111.111.100 255.255.255.255",
    );
    expect(plan.message).toContain(LAN_HOST_TEST_TITLE);
  });

  it("excludes locally with the exact Linux fix when probed on Linux", () => {
    const plan = planLanHostPreflight({
      probeOutput: "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536",
      isCI: false,
    });
    expect(plan.excluded).toBe(true);
    expect(plan.message).toContain("sudo ip addr add 111.111.111.100/32 dev lo");
  });

  it("never excludes in CI: the workflow must create the alias and coverage stays on", () => {
    const plan = planLanHostPreflight({ probeOutput: null, isCI: true });
    expect(plan.excluded).toBe(false);
    expect(plan.message).toContain(LAN_HOST);
    expect(plan.message).toContain("still runs");
  });

  it("escapes the test title so parens are matched literally", () => {
    const re = lanHostTitlePattern();
    expect(re.test(`Auth flow regression (LAN host) > login lands`)).toBe(true);
    expect(re.test("Auth flow regression LAN host")).toBe(false);
  });

  it("picks the platform probe command", () => {
    expect(probeCommand("darwin")).toBe("ifconfig lo0");
    expect(probeCommand("linux")).toBe("ip addr show lo");
    expect(probeCommand("win32")).toBeNull();
  });

  it("exposes the exact host and title constants", () => {
    expect(LAN_HOST).toBe("111.111.111.100");
    expect(LAN_HOST_TEST_TITLE).toBe("Auth flow regression (LAN host)");
  });
});
