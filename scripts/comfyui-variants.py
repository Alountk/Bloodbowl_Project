#!/usr/bin/env python3
"""Generate N VARIANTS per positional for a team, each with its role-tail prompt.

The user picks the best of N variants per position. Each variant uses a
different seed, the approved WHF prompt builder (subject = the ROLE, never the
fantasy name), a per-role tail (thrower holds a ball, blitzer heavy pads...),
the polished pixel-art style, and the robust background key.

Usage:
  python3 scripts/comfyui-variants.py --team amazon --variants 4
  python3 scripts/comfyui-variants.py --team amazon --role thrower --variants 4
"""

import argparse
import glob
import importlib.util
import json
import os
import random
import subprocess
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = os.path.join(REPO_ROOT, "scripts", "comfyui-generate.py")
DESIGNS = "/Volumes/Mac_Nvme/Dev/bloodbowl_designs"
OUT_ROOT = os.path.join(DESIGNS, "sprites-gemini", "comfy-variantes")

# Per-role FULL descriptions — they REPLACE the generic role flavor so the
# prompt never contradicts itself (the catalog maps catcher->"Blitzer" role, so
# the generic "armored blitzer with heavy shoulder pads" clashed with the
# catcher's light-armor tail and the model ignored the tail). Amazon names:
# linewoman=Eagle Warrior, thrower=Python Warrior, catcher=Piranha Warrior,
# blitzer=Jaguar Warrior. Empty = keep the generic flavor.
ROLE_TAILS = {
    # Eagle Warrior (v4 approved + color pass): DARK BROWN leather gloves and
    # boots (the model keeps painting fuchsia — the exact tone + negatives).
    "linewoman": ("a graceful athletic bronze-skinned WOMAN warrior with NO "
                  "helmet, bare head with hair, no feathers, no headdress, "
                  "light leather armor, DARK BROWN (#5b3a1e) leather gloves "
                  "and DARK BROWN (#5b3a1e) leather boots"),
    "thrower": ("a graceful athletic bronze-skinned WOMAN thrower wearing "
                "Aztec-style feather plumage on the arms, feathered bracers "
                "like an aztec warrior, holding a leather football"),
    "catcher": ("a graceful athletic bronze-skinned WOMAN, a swift runner with "
                "LIGHT minimal armor and a GOLDEN MASK instead of a helmet"),
    "blitzer": ("a graceful athletic bronze-skinned WOMAN, the strongest "
                "player, wearing a JAGUAR MASK, white robust heavy armor, "
                "slightly bigger and bulkier than the others"),
    "runner": "a swift runner holding a football in light sprinting gear",
    "gutter-runner": "a lean fast gutter runner in light gear",
    "skeleton-lineman": "",
    "zombie-lineman": "",
    "ghoul-runner": "a fast lean ghoul runner",
    "wight-blitzer": "a wight blitzer in heavy dark armor",
    "mummy": "",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--team", required=True)
    ap.add_argument("--role", default=None, help="only this positional")
    ap.add_argument("--variants", type=int, default=4)
    ap.add_argument("--base-image", default=None)
    ap.add_argument("--denoise", type=float, default=0.72)
    ap.add_argument("--start-seed", type=int, default=2000)
    ap.add_argument("--style", default="pixel", choices=["clasico", "minimal", "detallado", "retro", "pixel"])
    args = ap.parse_args()

    spec = importlib.util.spec_from_file_location("cg", GEN)
    cg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cg)
    g = cg.load_gemini_module()
    teams = g.load_teams_from_catalog()
    if args.team not in teams:
        sys.exit(f"unknown team: {args.team}")
    team_name, entries = teams[args.team]
    roles = [args.role] if args.role else [e[0] for e in entries]

    outdir = os.path.join(OUT_ROOT, args.team)
    os.makedirs(outdir, exist_ok=True)
    print(f"== {team_name}: {len(roles)} posiciones x {args.variants} variantes")

    for role in roles:
        _, pname, _flavor, size, _role, subject = next(e for e in entries if e[0] == role)
        # Build the full prompt. The role DISTINCTION goes immediately after the
        # subject intro ("front view.") — the model's attention peak — NOT at the
        # end (appended tails get ignored and every position renders the same).
        import re
        base = g.team_prompt(args.team, role, teams)
        tail = ROLE_TAILS.get(role)
        if tail:
            # Replace the WHOLE flavor block ("The {subject} is: <anatomy>.
            # <generic role>.") up to the gear sentence — the tails carry the
            # woman-ness themselves, so nothing is lost and nothing contradicts.
            base = re.sub(
                r"The [A-Za-z ]+? is: .*?Fantasy football gear only",
                f"The {subject} is: {tail}. Fantasy football gear only",
                base,
                count=1,
                flags=re.DOTALL,
            )
        prompt = base
        prompt += cg.STYLE_MODS.get(args.style, "")
        prompt += " ONE single centered character standing alone, no other figures, no second player, no shields, no weapons, no banners."
        prompt += cg.BKG_TAIL if hasattr(cg, "BKG_TAIL") else ""

        for v in range(1, args.variants + 1):
            seed = args.start_seed + v + (1000 * roles.index(role))
            role_out = os.path.join(outdir, f"{role}-v{v}")
            os.makedirs(role_out, exist_ok=True)
            raw = os.path.join(role_out, f"{args.team}-{role}.raw.png")
            if os.path.exists(raw) and os.path.getsize(raw) > 1000:
                print(f"  {role} v{v}: skip")
                continue
            cmd = [sys.executable, GEN, "--team", args.team, "--role", role,
                   "--outdir", role_out, "--seed", str(seed), "--style", "pixel",
                   "--denoise", str(args.denoise), "--prompt", prompt]
            if args.base_image:
                cmd += ["--base-image", args.base_image]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            status = "OK" if r.returncode == 0 else f"FAIL {(r.stderr or '')[-200:]}"
            print(f"  {role} v{v} (seed {seed}): {status}")

    # Preview grid: positions x variants.
    html = preview_grid(args.team, teams, roles, args.variants, outdir)
    preview_path = os.path.join(DESIGNS, "sprites-gemini", f"preview-{args.team}-variantes.html")
    with open(preview_path, "w") as fh:
        fh.write(html)
    print(f"preview: {preview_path}")


def preview_grid(team, teams, roles, variants, outdir):
    _, entries = teams[team]
    badge = {"big": "badge big", "small": "badge small", "normal": "badge"}
    rows = []
    for role in roles:
        pname = next(e[1] for e in entries if e[0] == role)
        cells = []
        for v in range(1, variants + 1):
            rel = os.path.relpath(os.path.join(outdir, f"{role}-v{v}"), os.path.dirname(outdir))
            # The preview lives in sprites-gemini/, the outputs under comfy-variantes/.
            raw = f"comfy-variantes/{rel}/{team}-{role}.raw.png"
            cells.append(
                '<div class="cell"><div class="stage"><img class="raw" src="'
                + raw
                + f'" alt="{pname} v{v}"></div><p class="vlabel">v{v}</p></div>',
            )
        rows.append(f"""<div class="posrow">
          <h3>{pname}</h3>
          <div class="cells">{"".join(cells)}</div>
        </div>""")
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>{team} — variantes por posición</title>
<style>
  body {{ font-family: -apple-system, system-ui, sans-serif; background: #f8fafc; color: #12225a; margin: 2rem; }}
  h1 {{ font-size: 1.4rem; }}
  .posrow {{ margin-bottom: 2.2rem; }}
  h3 {{ font-size: 1rem; margin-bottom: .4rem; border-bottom: 2px solid #12225a; padding-bottom: .2rem; }}
  .cells {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }}
  .cell {{ background: #fff; border: 1px solid #d8dce8; border-radius: 8px; padding: .6rem; text-align:center; }}
  .stage {{ display:flex; align-items:center; justify-content:center; gap: .6rem; min-height: 170px; background:#eef0f6; border-radius:6px; padding:.4rem; }}
  .imgbox {{ display:flex; flex-direction:column; align-items:center; gap:.2rem; }}
  .lbl {{ font-size:.65rem; color:#64748b; }}
  .raw {{ max-width:110px; max-height:110px; }}
  .thumb {{ image-rendering: pixelated; width:56px; height:56px; }}
  .vlabel {{ font-size:.75rem; font-weight:700; color:#12225a; margin:.3rem 0 0; }}
</style>
</head>
<body>
  <h1>{team} — {variants} variantes por posición</h1>
  {"".join(rows)}
</body>
</html>"""


if __name__ == "__main__":
    main()
