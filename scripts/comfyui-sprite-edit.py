#!/usr/bin/env python3
"""Run the sprite-edit workflow (sprite-edit-workflow-api.json): IPAdapter +
img2img variation + masked inpaint in one pass. Fills the placeholders.

Usage:
  python3 scripts/comfyui-sprite-edit.py \
      --reference base-eagle.png \
      --negative-reference amazon-thrower.raw.png \
      --good-sprite <png> --mask <mask.png> \
      --prompt "..." --out out.png
"""

import argparse
import importlib.util
import json
import os
import random
import sys
import time
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = os.path.join(REPO_ROOT, "scripts", "comfyui-generate.py")
WORKFLOW = os.path.join(REPO_ROOT, "sprite-edit-workflow-api.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reference", required=True, help="IPAdapter reference (the good sprite style)")
    ap.add_argument("--negative-reference", default=None, help="IPAdapter negative reference")
    ap.add_argument("--good-sprite", required=True, help="the base image to modify")
    ap.add_argument("--mask", required=True, help="mask PNG (white = regenerate)")
    ap.add_argument("--prompt", required=True, help="the small change")
    ap.add_argument("--negative", default=None)
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=None)
    args = ap.parse_args()

    spec = importlib.util.spec_from_file_location("cg", GEN)
    cg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cg)
    BASE = cg.BASE

    workflow = json.load(open(WORKFLOW))
    # Placeholders: reference (49) / negative (50) may already be filenames on
    # the server; good sprite (60) and mask (62) are uploaded.
    def resolve(img):
        return img if not os.path.exists(img) else cg.upload_image(img)

    workflow["49"]["inputs"]["image"] = resolve(args.reference)
    if args.negative_reference:
        workflow["50"]["inputs"]["image"] = resolve(args.negative_reference)
    workflow["60"]["inputs"]["image"] = cg.upload_image(args.good_sprite)
    workflow["62"]["inputs"]["image"] = cg.upload_image(args.mask)
    workflow["6"]["inputs"]["text"] = args.prompt
    if args.negative:
        workflow["7"]["inputs"]["text"] = args.negative
    seed = args.seed if args.seed is not None else random.randint(0, 2**31 - 1)
    workflow["3"]["inputs"]["seed"] = seed
    workflow["64"]["inputs"]["seed"] = seed

    res = cg.http_post(f"{BASE}/prompt", {"prompt": workflow})
    pid = res.get("prompt_id")
    if not pid:
        print("QUEUE ERROR:", json.dumps(res)[:400])
        sys.exit(1)
    print("queued:", pid, "seed:", seed)
    for _ in range(180):
        time.sleep(2)
        try:
            hist = cg.http_get(f"{BASE}/history/{pid}")
        except Exception:
            continue
        if pid in hist:
            st = hist[pid]["status"]
            if st.get("completed"):
                saved = []
                for out in hist[pid]["outputs"].values():
                    for im in out.get("images", []):
                        url = (f"{BASE}/view?filename={im['filename']}"
                               f"&subfolder={im.get('subfolder','')}&type={im.get('type','output')}")
                        name = args.out if not saved else args.out.replace(".png", f"-{len(saved)+1}.png")
                        urllib.request.urlretrieve(url, name)
                        saved.append(name)
                print("saved:", saved)
                return
            if st.get("status_str") == "error":
                print("ERROR:", json.dumps(st)[:500])
                sys.exit(1)
    print("timeout")
    sys.exit(1)


if __name__ == "__main__":
    main()
