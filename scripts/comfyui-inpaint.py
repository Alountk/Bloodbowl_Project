#!/usr/bin/env python3
"""Targeted inpainting via ComfyUI — regenerate ONLY a masked region so the
rest of the figure stays pixel-identical (the industry-standard technique for
"change one detail without distorting the rest").

Usage:
  python3 scripts/comfyui-inpaint.py --base-image <png> \
      --mask-zones "0.12,0.30,0.30,0.70" "0.68,0.88,0.30,0.70" \
      --prompt "feathered gloves" --out out.png

Mask zones are (x0, x1, y0, y1) fractions of the image. The mask PNG (white =
region to regenerate, black = untouched) is built locally and uploaded.
"""

import argparse
import importlib.util
import json
import os
import sys
import time
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = os.path.join(REPO_ROOT, "scripts", "comfyui-generate.py")
WORKFLOW_PATH = os.path.join(REPO_ROOT, "pixel_art_api.json")

NEGATIVE = (
    "photorealistic, 3d render, smooth gradients, blurry, high resolution, "
    "modern digital painting, anti-aliasing, vector art, distorted anatomy, "
    "pink gloves, fuchsia gloves, magenta gloves, feathered helmet, "
    "headdress feathers, plume on helmet, model base, pedestal, diorama, "
    "multiple characters, two figures, group of people"
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-image", required=True)
    ap.add_argument("--mask-zones", nargs="+", default=None,
                    help="x0,x1,y0,y1 fractions to regenerate (repeatable)")
    ap.add_argument("--mask-file", default=None,
                    help="pre-built mask PNG (white=edit zone) instead of zones")
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--denoise", type=float, default=1.0)
    ap.add_argument("--seed", type=int, default=7777)
    args = ap.parse_args()

    spec = importlib.util.spec_from_file_location("cg", GEN)
    cg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cg)
    BASE = cg.BASE

    # 1. Build the mask PNG locally (white = edit zone).
    from PIL import Image, ImageDraw
    if args.mask_file:
        mask_path = args.mask_file
    else:
        img = Image.open(args.base_image).convert("RGB")
        w, h = img.size
        mask = Image.new("L", (w, h), 0)
        draw = ImageDraw.Draw(mask)
        for zone in args.mask_zones:
            x0, x1, y0, y1 = (float(v) for v in zone.split(","))
            draw.rectangle([int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)], fill=255)
        mask_path = args.out + ".mask.png"
        mask.save(mask_path)

    # 2. Upload base + mask.
    base_name = cg.upload_image(args.base_image)
    mask_name = cg.upload_image(mask_path)

    # 3. Workflow: LoadImage + LoadImageMask + VAEEncodeForInpaint + KSampler +
    #    VAEDecode + SaveImage. Prompt describes the CHANGE in the masked area.
    workflow = {
        "1": {"class_type": "LoadImage", "inputs": {"image": base_name}},
        "2": {"class_type": "LoadImageMask", "inputs": {"image": mask_name, "channel": "red"}},
        "3": {"class_type": "VAEEncodeForInpaint", "inputs": {
            "pixels": ["1", 0], "vae": ["7", 2], "mask": ["2", 0], "grow_mask_by": 6,
        }},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": args.prompt, "clip": ["7", 1]}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": NEGATIVE, "clip": ["7", 1]}},
        "7": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "pixelArtDiffusionXL_spriteShaper.safetensors"}},
        "8": {"class_type": "KSampler", "inputs": {
            "model": ["7", 0], "positive": ["4", 0], "negative": ["5", 0],
            "latent_image": ["3", 0], "seed": args.seed, "steps": 30,
            "cfg": 8, "sampler_name": "dpmpp_2m", "scheduler": "karras",
            "denoise": args.denoise,
        }},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["7", 2]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": "inpaint_test"}},
    }

    res = cg.http_post(f"{BASE}/prompt", {"prompt": workflow})
    pid = res.get("prompt_id")
    if not pid:
        print("QUEUE ERROR:", json.dumps(res)[:400])
        sys.exit(1)
    print("queued:", pid)
    for _ in range(120):
        time.sleep(2)
        try:
            hist = cg.http_get(f"{BASE}/history/{pid}")
        except Exception:
            continue
        if pid in hist:
            st = hist[pid]["status"]
            if st.get("completed"):
                for out in hist[pid]["outputs"].values():
                    for im in out.get("images", []):
                        url = f"{BASE}/view?filename={im['filename']}&subfolder=&type=output"
                        urllib.request.urlretrieve(url, args.out)
                        print("saved:", args.out)
                return
            if st.get("status_str") == "error":
                print("ERROR:", json.dumps(st)[:400])
                sys.exit(1)
    print("timeout")
    sys.exit(1)


if __name__ == "__main__":
    main()
