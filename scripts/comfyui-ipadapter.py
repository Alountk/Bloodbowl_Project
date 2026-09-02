#!/usr/bin/env python3
"""Generate with the IPAdapter workflow (pixel_art_api_2.json): the REFERENCE
image (the frozen character) is respected via IPAdapterPlus, and the prompt
describes only the CHANGES to apply (feathers, tiara, colors...).

Usage:
  python3 scripts/comfyui-ipadapter.py \
      --reference <frozen-character.png> \
      --prompt "leather gloves with feathers + feathered tiara" \
      --out out.png
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
WORKFLOW = os.path.join(REPO_ROOT, "pixel-art-workflow-api.json")

NEGATIVE = (
    "photorealistic, 3d render, smooth gradients, blurry, high resolution, "
    "modern digital painting, jpeg artifacts, anti-aliasing, vector art, "
    "distorted anatomy, extra limbs, different character, different pose, "
    "pink gloves, fuchsia gloves, magenta gloves, model base, pedestal, "
    "diorama, multiple characters, two figures, weapons, shields, "
    "tiara, crown, headband, headdress, hat, helmet, changes to the hair, "
    "changes to the ears, earrings, face changes"
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reference", required=True, help="the frozen character PNG")
    ap.add_argument("--prompt", required=True, help="the CHANGES to apply")
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--negative-image", default=None,
                    help="IPAdapter image_negative (what the result must NOT "
                         "look like); optional")
    ap.add_argument("--denoise", type=float, default=1.0,
                    help="KSampler denoise (the renovated workflow drives "
                         "fidelity through IPAdapter, not img2img)")
    args = ap.parse_args()

    spec = importlib.util.spec_from_file_location("cg", GEN)
    cg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cg)
    BASE = cg.BASE

    workflow = json.load(open(WORKFLOW))
    # Reference image (IPAdapter positive): node 49.
    ref_name = cg.upload_image(args.reference)
    workflow["49"]["inputs"]["image"] = ref_name
    # image_negative (node 50): optional — when omitted, KEEP the workflow's
    # configured negative image untouched (the user may have set one).
    # Prompt = the changes (node 6), negative (node 7), seed (node 3).
    workflow["6"]["inputs"]["text"] = args.prompt
    workflow["7"]["inputs"]["text"] = NEGATIVE
    workflow["3"]["inputs"]["seed"] = args.seed if args.seed is not None else random.randint(0, 2**31 - 1)
    workflow["3"]["inputs"]["denoise"] = args.denoise

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
                        url = (f"{BASE}/view?filename={im['filename']}"
                               f"&subfolder={im.get('subfolder','')}&type={im.get('type','output')}")
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
