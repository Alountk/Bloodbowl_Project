/**
 * Scrapes the TourPlay BB2025 team catalog (https://tourplay.net/en/blood-bowl/teams)
 * into a JSON snapshot. The teams page is a client-rendered Angular app: each race
 * toggle reveals its roster table on the same page, so we click every toggle in DOM
 * order and extract the roster for each team.
 *
 * Usage: node scripts/scrape-tourplay-teams.mjs [outputPath]
 * Output defaults to <TMPDIR>/rau50/tourplay-snapshot.json (NOT committed).
 *
 * Reference only — the snapshot is a temp artifact and must not be committed.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const TEAMS_URL = "https://tourplay.net/en/blood-bowl/teams";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const TEAM_TIMEOUT_MS = 25_000;

const DEFAULT_OUTPUT = resolve(
  process.env.TMPDIR ?? "/tmp",
  "rau50",
  "tourplay-snapshot.json",
);
const OUTPUT_PATH = process.argv[2] ?? DEFAULT_OUTPUT;

/** Runs in the browser page context — must be fully self-contained. */
function extractTeamState() {
  const clean = (value) => (value ?? "").replace(/\s+/g, " ").trim();
  const parseCost = (raw) => {
    if (!raw) return null;
    const cleaned = raw.replace(/[,.\u00A0\s]/g, "");
    const breakdown = cleaned.match(/^\((\d+)\+(\d+)\)(k)?$/);
    if (breakdown) {
      const base = Number(breakdown[1]);
      return breakdown[3] ? base * 1000 : base;
    }
    const plain = cleaned.match(/^(\d+)(k)?$/);
    if (plain) {
      const value = Number(plain[1]);
      return plain[2] ? value * 1000 : value;
    }
    return null;
  };

  const bodyText = document.body.innerText;

  const headerMatch = bodyText.match(/★([^★]+)★/);
  const reRollMatch = bodyText.match(/re-?rolls?\s*:?\s*x?\s*([\d,.]+)\s*gp\.?/i);

  const tables = Array.from(document.querySelectorAll("table"));
  const rosterTable = tables.find(
    (t) =>
      t.innerText.includes("POSITION") &&
      t.innerText.includes("CHARACTERISTICS") &&
      t.querySelector("tr.mat-header-row"),
  );

  if (!rosterTable) {
    return {
      header: headerMatch ? clean(headerMatch[1]) : null,
      rerollRaw: reRollMatch ? reRollMatch[1] : null,
      rerollCost: reRollMatch ? parseCost(reRollMatch[1]) : null,
      positionals: null,
      note: "roster table not found",
    };
  }

  const rows = Array.from(rosterTable.querySelectorAll("tr.mat-row"));
  const positionals = rows.map((row) => {
    const posTd = row.querySelector("td.cdk-column-position");
    const name = clean(posTd?.querySelector(".mat-caption")?.textContent);
    const caption = clean(posTd?.querySelector(".mat-caption--small")?.textContent);

    const minMaxMatch = (caption ?? "").match(/(\d+)\s*-\s*(\d+)/);
    const min = minMaxMatch ? Number(minMaxMatch[1]) : null;
    const max = minMaxMatch ? Number(minMaxMatch[2]) : null;

    const roleMatch = (caption ?? "").match(/\(([^,]+),\s*([^)]+)\)/);
    const role = roleMatch ? clean(roleMatch[1]) : null;
    const race = roleMatch ? clean(roleMatch[2]) : null;

    const attrEls = Array.from(
      row.querySelectorAll("td.cdk-column-characteristics tp-table-attributes .attr"),
    );
    const valueEls = Array.from(
      row.querySelectorAll("td.cdk-column-characteristics tp-table-attributes .value"),
    );
    const attrs = {};
    attrEls.forEach((el, i) => {
      const key = clean(el.textContent).toUpperCase();
      const value = clean(valueEls[i]?.textContent);
      if (key) attrs[key] = value;
    });

    const skillsTd = row.querySelector("td.cdk-column-skills");
    const skills = skillsTd
      ? skillsTd.textContent
          .split(",")
          .map((s) => s.replace(/[◆✦★]/g, "").trim())
          .filter(Boolean)
      : [];

    const costRaw = clean(row.querySelector("td.cdk-column-value")?.textContent);

    return {
      name,
      caption,
      role,
      race,
      min,
      max,
      ma: attrs.MA !== undefined ? Number(attrs.MA) : null,
      st: attrs.ST !== undefined ? Number(attrs.ST) : null,
      ag: attrs.AG ?? null,
      pa: attrs.PA ?? null,
      av: attrs.AV ?? null,
      skills,
      primary: clean(row.querySelector("td.cdk-column-skillNormal")?.textContent) || null,
      secondary: clean(row.querySelector("td.cdk-column-skillDouble")?.textContent) || null,
      costRaw,
      cost: parseCost(costRaw),
    };
  });

  return {
    header: headerMatch ? clean(headerMatch[1]) : null,
    rerollRaw: reRollMatch ? reRollMatch[1] : null,
    rerollCost: reRollMatch ? parseCost(reRollMatch[1]) : null,
    positionals,
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: USER_AGENT,
  locale: "en-GB",
  viewport: { width: 1440, height: 2000 },
});

const page = await context.newPage();
const failures = [];
const teams = [];
let teamNames = [];

try {
  await page.goto(TEAMS_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("mat-button-toggle-group.toogle-race", { timeout: 30_000 });

  const rulesSet = await page.$$eval(
    "mat-button-toggle-group.toogle-rules-set mat-button-toggle",
    (els) =>
      els.map((el) => ({
        text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
        checked: el.classList.contains("mat-button-toggle-checked"),
      })),
  );
  const activeRules = rulesSet.find((r) => r.checked);
  if (!activeRules || !activeRules.text.includes("BB2025")) {
    await page
      .locator("mat-button-toggle-group.toogle-rules-set mat-button-toggle")
      .filter({ hasText: "BB2025" })
      .first()
      .click();
    await page.waitForTimeout(3000);
  }

  teamNames = await page.$$eval(
    "mat-button-toggle-group.toogle-race mat-button-toggle",
    (els) =>
      els.map((el) => {
        const mini = el.querySelector(".race-team--mini");
        const raw = (mini?.textContent || el.textContent || "").replace(/\s+/g, " ").trim();
        return raw;
      }),
  );

  const MAX_TEAMS = Number(process.env.MAX_TEAMS ?? 0) || teamNames.length;
  for (let idx = 0; idx < MAX_TEAMS; idx += 1) {
    const teamName = teamNames[idx];
    const startedAt = Date.now();
    try {
      await page
        .locator("mat-button-toggle-group.toogle-race mat-button-toggle")
        .nth(idx)
        .click();

      await page.waitForFunction(
        (name) => {
          const m = document.body.innerText.match(/★([^★]+)★/);
          return m && m[1].toLowerCase() === name.toLowerCase();
        },
        teamName,
        { timeout: TEAM_TIMEOUT_MS },
      );

      const state = await page.evaluate(extractTeamState);
      teams.push({ team: teamName, ...state });
      console.log(`OK ${teamName} (${state.positionals?.length ?? 0} positionals, reroll ${state.rerollCost ?? "?"}) [${Date.now() - startedAt}ms]`);
    } catch (error) {
      failures.push({ team: teamName, error: error instanceof Error ? error.message : String(error) });
      console.error(`FAIL ${teamName}: ${error instanceof Error ? error.message : error}`);
    }
  }
} finally {
  await browser.close();
}

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
const snapshot = {
  scrapedAt: new Date().toISOString(),
  sourceUrl: TEAMS_URL,
  rulesSet: "BB2025",
  teamCount: teamNames.length,
  teams,
  failures,
};
writeFileSync(OUTPUT_PATH, JSON.stringify(snapshot, null, 2) + "\n");

console.log(`\nScrape done: ${teams.length}/${teamNames.length} teams extracted, ${failures.length} failures`);
console.log(`Snapshot: ${OUTPUT_PATH}`);
if (failures.length > 0) {
  console.error("Failures:", JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}
