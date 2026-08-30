#!/usr/bin/env python3
"""Generate team sprites LOCALLY via ComfyUI — no external tokens.

Reads the base workflow from `pixel_art_api.json` (SDXL pixel-art model +
LoRA at the configured ComfyUI server), swaps the prompt per positional
(reusing the approved Warhammer-Fantasy prompt builder from
gemini-sprite-gen.py), queues it, downloads the raw, then post-processes:

  1. Flood-fill background removal from the borders (robust to whatever
     background color the model paints — the magenta key is not respected).
  2. Trim + box downscale (crisp) + palette quantization to the project
     rulebook-light palette (same "crisp" style the user approved).
  3. 64px thumbnail (fit by size class: big 64 / normal 52 / small 38) +
     128px preview.

Usage:
  python3 scripts/comfyui-generate.py --team human --role blitzer
  python3 scripts/comfyui-generate.py --team human          # all positionals
  python3 scripts/comfyui-generate.py --team human --skip-raw   # only thumbs
"""

import argparse
import importlib.util
import json
import os
import random
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import deque

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The approved WHF prompt builder lives in the design repo (same one the Gemini
# pipeline uses); fall back to a repo-local copy if the designs repo moves.
DESIGNS = "/Volumes/Mac_Nvme/Dev/bloodbowl_designs"
GEN_MOD = os.path.join(DESIGNS, "scripts", "gemini-sprite-gen.py")
if not os.path.exists(GEN_MOD):
    GEN_MOD = os.path.join(REPO_ROOT, "scripts", "gemini-sprite-gen.py")
WORKFLOW_PATH = os.path.join(REPO_ROOT, "pixel_art_api.json")
BASE = os.environ.get("COMFYUI_BASE", "http://111.111.111.20:42007")

NEGATIVE_PROMPT = (
    "photorealistic, 3d render, smooth gradients, blurry, high resolution, "
    "modern digital painting, anti-aliasing, vector art, distorted anatomy, "
    "running, jumping, dynamic pose, grass, field, ground, text, weapons"
)

FIT_BY_SIZE = {"big": 64, "normal": 52, "small": 38}


def load_gemini_module():
    spec = importlib.util.spec_from_file_location("gemini_gen", GEN_MOD)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def http_post(url, data):
    req = urllib.request.Request(
        url, data=json.dumps(data).encode(), headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def http_get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def queue_prompt(workflow, prompt, seed):
    workflow["4"]["inputs"]["text"] = prompt
    workflow["7"]["inputs"]["text"] = NEGATIVE_PROMPT
    workflow["5"]["inputs"]["noise_seed"] = seed
    return http_post(f"{BASE}/prompt", {"prompt": workflow})


def wait_and_download(pid, out_path, timeout_s=240):
    for _ in range(timeout_s // 2):
        time.sleep(2)
        try:
            hist = http_get(f"{BASE}/history/{pid}")
        except Exception:
            continue
        if pid not in hist:
            continue
        status = hist[pid].get("status", {})
        if status.get("completed"):
            for out in hist[pid].get("outputs", {}).values():
                for img in out.get("images", []):
                    url = f"{BASE}/view?filename={img['filename']}&subfolder={img.get('subfolder','')}&type={img.get('type','output')}"
                    with urllib.request.urlopen(url, timeout=60) as r:
                        data = r.read()
                    with open(out_path, "wb") as fh:
                        fh.write(data)
                    return True
            return False
        if status.get("status_str") == "error":
            print(f"  ComfyUI error: {json.dumps(status)[:300]}")
            return False
    print("  timeout waiting for generation")
    return False


def flood_fill_key(img, tol=40):
    """Removes the background connected to the image borders (whatever color)."""
    from PIL import Image

    px = img.load()
    w, h = img.size
    visited = set()
    queue = deque()
    for x in range(w):
        queue.append((x, 0))
        queue.append((x, h - 1))
    for y in range(h):
        queue.append((0, y))
        queue.append((w - 1, y))
    bg = px[0, 0]

    def similar(c1, c2):
        return all(abs(a - b) <= tol for a, b in zip(c1[:3], c2[:3]))

    while queue:
        x, y = queue.popleft()
        if (x, y) in visited:
            continue
        visited.add((x, y))
        if similar(px[x, y], bg):
            px[x, y] = (0, 0, 0, 0)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visited:
                    queue.append((nx, ny))
    return img


def crisp_postprocess(raw_path, out_path, target, fit_height):
    """Key + trim + box downscale + palette quantize (approved 'crisp' style)."""
    from PIL import Image

    img = Image.open(raw_path).convert("RGBA")
    img = flood_fill_key(img)
    bbox = img.getbbox()
    if not bbox:
        print("  fully transparent after keying — skipping")
        return False
    img = img.crop(bbox)
    iw, ih = img.size
    scale = fit_height / ih
    img = img.resize((max(1, int(iw * scale)), max(1, int(ih * scale))), Image.BOX)
    # Palette quantization (same helper as the Gemini pipeline).
    g = load_gemini_module()
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, gg, b, a = px[x, y]
            if a > 0:
                px[x, y] = g.nearest_palette((r, gg, b)) + (a,)
    canvas = Image.new("RGBA", (target, target), (0, 0, 0, 0))
    ox = (target - img.width) // 2
    oy = (target - img.height) // 2
    canvas.alpha_composite(img, (ox, oy))
    canvas.save(out_path)
    return True


def generate_one(g, teams, team, role, outdir, seed):
    base = os.path.join(outdir, f"{team}-{role}")
    raw = base + ".raw.png"
    thumb = base + "-64.png"
    big = base + "-128.png"

    _, entries = teams[team]
    entry = next((e for e in entries if e[0] == role), None)
    if entry is None:
        return (role, f"FAIL unknown positional {role}")
    size = entry[3]
    fit = FIT_BY_SIZE.get(size, 52)

    if not (os.path.exists(raw) and os.path.getsize(raw) > 1000):
        prompt = g.team_prompt(team, role, teams)
        workflow = json.load(open(WORKFLOW_PATH))
        res = queue_prompt(workflow, prompt, seed)
        pid = res.get("prompt_id")
        if not pid:
            return (role, f"FAIL queue: {json.dumps(res)[:200]}")
        if not wait_and_download(pid, raw):
            return (role, "FAIL generation")
        print(f"  {role}: raw ok ({os.path.getsize(raw)} bytes)")

    if not (os.path.exists(thumb) and os.path.getsize(thumb) > 100):
        if not crisp_postprocess(raw, thumb, 64, fit):
            return (role, "FAIL thumb")
    if not (os.path.exists(big) and os.path.getsize(big) > 100):
        crisp_postprocess(raw, big, 128, fit * 2)
    return (role, "ok")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--team", required=True)
    ap.add_argument("--role", default=None)
    ap.add_argument("--outdir", default=os.path.join(REPO_ROOT, "..", "bloodbowl_designs", "sprites-gemini", "comfy"))
    ap.add_argument("--workers", type=int, default=1)
    ap.add_argument("--seed", type=int, default=None)
    args = ap.parse_args()

    g = load_gemini_module()
    teams = g.load_teams_from_catalog()
    if args.team not in teams:
        sys.exit(f"unknown team: {args.team}")
    team_name, entries = teams[args.team]
    roles = [args.role] if args.role else [e[0] for e in entries]
    outdir = os.path.abspath(args.outdir)
    os.makedirs(outdir, exist_ok=True)

    print(f"== {team_name} ({args.team}) — {len(roles)} positionals via ComfyUI")

    def one(role):
        seed = args.seed if args.seed is not None else random.randint(0, 2**31 - 1)
        return generate_one(g, teams, args.team, role, outdir, seed)

    if args.workers == 1:
        for role in roles:
            r, st = one(role)
            print(f"  {r}: {st}")
    else:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futs = {pool.submit(one, r): r for r in roles}
            for fut in as_completed(futs):
                r, st = fut.result()
                print(f"  {r}: {st}")

    # Preview HTML (same layout as the gemini team previews).
    badge = {"big": "badge big", "small": "badge small", "normal": "badge"}
    label = {"big": "big", "small": "small", "normal": "normal"}
    cards = []
    for pkey, pname, _flavor, size, _role in entries:
        if args.role and pkey != args.role:
            continue
        raw = f"{args.team}-{pkey}.raw.png"
        thumb = f"{args.team}-{pkey}-64.png"
        big = f"{args.team}-{pkey}-128.png"
        cards.append(f"""<div class="card">
          <div class="stage"><img class="raw" src="{raw}" alt="{pname}"><img class="thumb" src="{thumb}" alt="{pname} 64px"></div>
          <h3>{pname}</h3><span class="{badge[size]}">{label[size]}</span>
        </div>""")
    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>{team_name} — ComfyUI (local)</title>
<style>
  body {{ font-family: -apple-system, system-ui, sans-serif; background: #f8fafc; color: #12225a; margin: 2rem; }}
  h1 {{ font-size: 1.4rem; }}
  .roles {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; max-width: 1000px; }}
  .card {{ background: #fff; border: 1px solid #d8dce8; border-radius: 8px; padding: 1rem; text-align:center; }}
  .stage {{ display:flex; flex-direction:column; align-items:center; gap:.6rem; min-height:240px; justify-content:center; }}
  .raw {{ max-width:150px; max-height:150px; border-radius:6px; border:1px solid #eef0f6; }}
  .thumb {{ image-rendering: pixelated; width:64px; height:64px; border-radius:4px; }}
  h3 {{ font-size: .9rem; margin: .4rem 0; }}
  .badge {{ display:inline-block; background:#12225a; color:#fff; border-radius:10px; padding:1px 8px; font-size:.68rem; text-transform:uppercase; }}
  .badge.big {{ background:#d11938; }} .badge.small {{ background:#9aa4c8; }}
</style>
</head>
<body>
  <h1>{team_name} — ComfyUI (local, sin tokens)</h1>
  <p class="caption" style="font-size:.8rem;color:#555">Raw 512 + thumbnail crisp 64px · flood-fill key + paleta del proyecto</p>
  <div class="roles">{"".join(cards)}</div>
</body>
</html>"""
    preview = os.path.join(DESIGNS, "sprites-gemini", f"preview-{args.team}-comfy.html")
    os.makedirs(os.path.dirname(preview), exist_ok=True)
    with open(preview, "w") as fh:
        fh.write(html)
    print(f"preview: {preview}")


if __name__ == "__main__":
    main()
