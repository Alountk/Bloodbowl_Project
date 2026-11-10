import { execSync } from "node:child_process";

/**
 * Preflight for the production-shaped LAN e2e regression (see
 * `Auth flow regression (LAN host)` in e2e/auth.spec.ts).
 *
 * That test navigates to the literal LAN IP because the reported
 * "no access until refresh" bug only reproduced against the production
 * host shape. The IP must exist on a local interface or Chromium aborts
 * the navigation with a cryptic `net::ERR_ABORTED` before touching the app:
 * - CI creates it in .github/workflows/docker-publish.yml (ip addr add).
 * - macOS local runs need a loopback alias (ifconfig lo0 alias ...).
 * `/etc/hosts` does NOT help — it only maps names, the IP still has to
 * be configured on an interface.
 *
 * When the alias is missing the LAN test is excluded (grepInvert) with the
 * exact fix printed, instead of failing with ERR_ABORTED. In CI the test is
 * NEVER excluded: a missing alias there is a workflow regression and must
 * stay loud (the test fails, coverage stays on).
 */

/** Loopback IP the LAN regression test navigates to (mirrors the deploy host). */
export const LAN_HOST = "111.111.111.100";

/** Playwright describe title that requires LAN_HOST to be routable. */
export const LAN_HOST_TEST_TITLE = "Auth flow regression (LAN host)";

/** Command that prints loopback addresses for the current platform (null = unknown). */
export function probeCommand(platform: NodeJS.Platform): string | null {
  if (platform === "darwin") return "ifconfig lo0";
  if (platform === "linux") return "ip addr show lo";
  return null;
}

/** Runs the platform probe; returns raw output, or null when unavailable. */
export function probeLanHost(
  platform: NodeJS.Platform = process.platform,
): string | null {
  const cmd = probeCommand(platform);
  if (!cmd) return null;
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

/** Title as a literal-match RegExp (parens in the title are not groups). */
export function lanHostTitlePattern(): RegExp {
  return new RegExp(
    LAN_HOST_TEST_TITLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
}

/**
 * Decides whether the LAN test must be excluded from this run.
 * - alias present → run (no message);
 * - alias missing locally → exclude with the exact platform fix;
 * - alias missing in CI → never exclude; warn, let the test fail loudly.
 */
export function planLanHostPreflight(input: {
  probeOutput: string | null;
  isCI: boolean;
}): { excluded: boolean; message?: string } {
  const detected =
    input.probeOutput !== null && input.probeOutput.includes(LAN_HOST);
  if (detected) return { excluded: false };
  if (input.isCI) {
    return {
      excluded: false,
      message:
        `LAN-host e2e preflight: ${LAN_HOST} is missing in CI — the workflow must run ` +
        `\`sudo ip addr add ${LAN_HOST}/32 dev lo\` before \`test:e2e:auth\`. ` +
        `"${LAN_HOST_TEST_TITLE}" still runs in this environment and will fail until that step is restored.`,
    };
  }
  return {
    excluded: true,
    message:
      `LAN-host e2e preflight: ${LAN_HOST} is not configured on this machine, so ` +
      `"${LAN_HOST_TEST_TITLE}" is excluded from this run.\n` +
      `  Fix (macOS): sudo ifconfig lo0 alias ${LAN_HOST} 255.255.255.255\n` +
      `  Fix (Linux): sudo ip addr add ${LAN_HOST}/32 dev lo`,
  };
}
