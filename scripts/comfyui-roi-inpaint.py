#!/usr/bin/env python3
"""Option A: ROI inpaint to add feathers to a sprite's gloves/boots via ComfyUI.

The glove/boot zone is tiny on a 768 canvas, so a plain full-image inpaint
can't draw recognizable feathers (the model smears color instead). This script
crops the zone, upscales x4 (nearest), inpaints ONLY that ROI with high denoise
(0.85) and the feather detail placed at the START of the prompt, downscales
back and pastes the result onto the base.

Requires the ComfyUI server (COMFYUI_BASE or default). Usage:
  python3 scripts/comfyui-roi-inpaint.py --base <png> --zone gloves --out <png>
  python3 scripts/comfyui-roi-inpaint.py --base <png> --zone boots --out <png>
"""

import argparse
import importlib.util
import json
import os
import random
import sys
import time
import urllib.request

from PIL import Image

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = os.path.join(REPO_ROOT, "scripts", "comfyui-generate.py")

# Same zone bands as the PIL painter (tight, so chest/skirt red trims don't
# contaminate): gloves ~48-63% height, boots ~66-87%.
ZONE_BANDS = {"gloves": (0.48, 0.63), "boots": (0.66, 0.87)}
UPSCALE = 4
DENOISE = 0.85

DEFAULT_PROMPTS = {
    "gloves": (
        "colorful feathers on the gloves, small bright feather tufts on the "
        "gauntlets, gold and white and red feathers sprouting from the wrist "
        "cuffs, pixel art sprite, crisp clean pixels, front view"
    ),
    "boots": (
        "colorful feathers on the boots, small bright feather tufts on the "
        "boot cuffs, gold and white and red feathers, pixel art sprite, "
        "crisp clean pixels, front view"
    ),
}
DEFAULT_NEGATIVE = (
    "low quality, blurry, deformed, watermark, text, signature, photoreal, "
    "3d render, smooth gradients, anti-aliasing"
)


def is_red(c):
    r, g, b = c[:3]
    return r > 140 and r > g + 60 and r > b + 60


def zone_bbox(px, w, h, zone):
    y0, y1 = ZONE_BANDS[zone]
    y0, y1 = int(h * y0), int(h * y1)
    pts = [(x, y) for y in range(y0, y1) for x in range(w) if is_red(px[x, y])]
    if not pts:
        return None
    cx = w // 2
    out = []
    for side in (0, 1):
        side_pts = [p for p in pts if (p[0] < cx) == (side == 0)]
        if len(side_pts) < 800:
            continue
        xs = [p[0] for p in side_pts]
        ys = [p[1] for p in side_pts]
        out.append((min(xs), min(ys), max(xs), max(ys)))
    return out or None


def make_mask(px, w, h, bbox, grow=12):
    """White where the red zone lives (dilated by `grow`), black elsewhere."""
    x0, y0, x1, y1 = bbox
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for y in range(max(0, y0 - grow), min(h, y1 + grow)):
        for x in range(max(0, x0 - grow), min(w, x1 + grow)):
            if x0 - grow <= x <= x1 + grow and y0 - grow <= y <= y1 + grow:
                if is_red(px[x, y]):
                    for dy in range(-grow, grow + 1):
                        for dx in range(-grow, grow + 1):
                            ny, nx = y + dy, x + dx
                            if 0 <= nx < w and 0 <= ny < h:
                                mp[nx, ny] = 255
    return mask


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, help="source sprite PNG (768 raw)")
    ap.add_argument("--zone", required=True, choices=["gloves", "boots"])
    ap.add_argument("--prompt", default=None, help="inpaint prompt (default per zone)")
    ap.add_argument("--negative", default=DEFAULT_NEGATIVE)
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--denoise", type=float, default=DENOISE)
    args = ap.parse_args()

    spec = importlib.util.spec_from_file_location("cg", GEN)
    cg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cg)
    BASE = cg.BASE

    img = Image.open(args.base).convert("RGBA")
    w, h = img.size
    px = img.load()
    boxes = zone_bbox(px, w, h, args.zone)
    if not boxes:
        raise SystemExit(f"no {args.zone} clusters detected")

    # Crop one combined ROI covering both clusters + margin.
    margin = 24
    x0 = max(0, min(b[0] for b in boxes) - margin)
    y0 = max(0, min(b[1] for b in boxes) - margin)
    x1 = min(w, max(b[2] for b in boxes) + margin)
    y1 = min(h, max(b[3] for b in boxes) + margin)
    roi = img.crop((x0, y0, x1, y1))
    roi_w, roi_h = roi.size
    big_w, big_h = roi_w * UPSCALE, roi_h * UPSCALE
    big = roi.resize((big_w, big_h), Image.NEAREST)

    mask = make_mask(px, w, h, (x0, y0, x1, y1), grow=12)
    roi_mask = mask.crop((x0, y0, x1, y1)).resize((big_w, big_h), Image.NEAREST)

    roi_path = "/tmp/roi.png"
    mask_path = "/tmp/roi_mask.png"
    big.save(roi_path)
    roi_mask.save(mask_path)
    print(f"ROI {roi_w}x{roi_h} -> upscaled {big_w}x{big_h}")

    # Minimal inpaint workflow: spriteShaper + lora -> VAEEncodeForInpaint ->
    # KSampler (denoise high) -> decode -> save. No IPAdapter needed: the ROI
    # carries its own local style.
    workflow = {
        "4": {"class_type": "CheckpointLoaderSimple",
              "inputs": {"ckpt_name": "pixelArtDiffusionXL_spriteShaper.safetensors"}},
        "39": {"class_type": "LoraLoader",
               "inputs": {"lora_name": "lora.safetensors", "strength_model": 1,
                          "strength_clip": 1, "model": ["4", 0], "clip": ["4", 1]}},
        "6": {"class_type": "CLIPTextEncode",
              "inputs": {"text": args.prompt or DEFAULT_PROMPTS[args.zone], "clip": ["39", 1]}},
        "7": {"class_type": "CLIPTextEncode",
              "inputs": {"text": args.negative, "clip": ["39", 1]}},
        "60": {"class_type": "LoadImage", "inputs": {"image": cg.upload_image(roi_path)}},
        "62": {"class_type": "LoadImageMask", "inputs": {"image": cg.upload_image(mask_path), "channel": "red"}},
        "63": {"class_type": "VAEEncodeForInpaint",
               "inputs": {"pixels": ["60", 0], "vae": ["4", 2], "mask": ["62", 0], "grow_mask_by": 8}},
        "64": {"class_type": "KSampler",
               "inputs": {"seed": args.seed if args.seed is not None else random.randint(0, 2**31 - 1),
                          "steps": 20, "cfg": 7, "sampler_name": "euler_ancestral",
                          "scheduler": "karras", "denoise": args.denoise,
                          "model": ["39", 0], "positive": ["6", 0], "negative": ["7", 0],
                          "latent_image": ["63", 0]}},
        "65": {"class_type": "VAEDecode", "inputs": {"samples": ["64", 0], "vae": ["4", 2]}},
        "67": {"class_type": "SaveImage", "inputs": {"filename_prefix": "roi-inpaint-", "images": ["65", 0]}},
    }
    seed = workflow["64"]["inputs"]["seed"]
    print("queuing ROI inpaint, seed:", seed)
    res = cg.http_post(f"{BASE}/prompt", {"prompt": workflow})
    pid = res.get("prompt_id")
    if not pid:
        print("QUEUE ERROR:", json.dumps(res)[:400])
        sys.exit(1)

    result_big = None
    for _ in range(180):
        time.sleep(2)
        try:
            hist = cg.http_get(f"{BASE}/history/{pid}")
        except Exception:
            continue
        if pid in hist:
            st = hist[pid]["status"]
            if st.get("completed"):
                for out in hist[pid]["outputs"].values():
                    for im_ in out.get("images", []):
                        url = (f"{BASE}/view?filename={im_['filename']}"
                               f"&subfolder={im_.get('subfolder','')}&type={im_.get('type','output')}")
                        with urllib.request.urlopen(url, timeout=60) as r:
                            data = r.read()
                        with open("/tmp/roi_result.png", "wb") as fh:
                            fh.write(data)
                        result_big = Image.open("/tmp/roi_result.png").convert("RGBA")
                break
            if st.get("status_str") == "error":
                print("ERROR:", json.dumps(st)[:500])
                sys.exit(1)
    if result_big is None:
        print("timeout")
        sys.exit(1)

    # Downscale the ROI result back and composite ONLY the masked area onto
    # the base (the unmasked region stays 100% original).
    result = result_big.resize((roi_w, roi_h), Image.NEAREST)
    result_mask = roi_mask.resize((roi_w, roi_h), Image.NEAREST)
    out = img.copy()
    op = out.load()
    rp = result.load()
    mp = result_mask.load()
    for yy in range(roi_h):
        for xx in range(roi_w):
            if mp[xx, yy] > 128:
                op[x0 + xx, y0 + yy] = rp[xx, yy]
    out.save(args.out)
    print("saved:", args.out)


if __name__ == "__main__":
    main()
