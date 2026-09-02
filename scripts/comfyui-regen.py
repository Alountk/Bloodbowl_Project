#!/usr/bin/env python3
"""Reconstruct the img2img generation that produced the approved sprites
(spriteShaper + lora, VAEEncode of the base as the latent, KSamplerAdvanced
with denoise). The original pixel_art_api.json was renamed away, so the
workflow is built inline with the same models/nodes.

Usage:
  python3 scripts/comfyui-regen.py --base-image base.png --prompt "..." \
      --denoise 0.85 --seed 2004 --out out.png
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-image", required=True)
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--negative", default=None)
    ap.add_argument("--out", required=True)
    ap.add_argument("--denoise", type=float, default=0.85)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--resolution", type=int, default=768)
    args = ap.parse_args()

    spec = importlib.util.spec_from_file_location("cg", GEN)
    cg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cg)
    BASE = cg.BASE

    negative = args.negative or cg.NEGATIVE_PROMPT + cg.BKG_NEGATIVES
    base_name = cg.upload_image(args.base_image)
    seed = args.seed if args.seed is not None else random.randint(0, 2**31 - 1)
    steps = 30

    workflow = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "pixelArtDiffusionXL_spriteShaper.safetensors"}},
        "3": {"class_type": "LoraLoader", "inputs": {"lora_name": "lora.safetensors", "strength_model": 1, "strength_clip": 1, "model": ["1", 0], "clip": ["1", 1]}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": args.prompt, "clip": ["3", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["3", 1]}},
        "10": {"class_type": "LoadImage", "inputs": {"image": base_name}},
        "11": {"class_type": "ImageScale", "inputs": {"image": ["10", 0], "width": args.resolution, "height": args.resolution, "upscale_method": "lanczos", "crop": "center"}},
        "12": {"class_type": "VAEEncode", "inputs": {"pixels": ["11", 0], "vae": ["1", 2]}},
        "5": {"class_type": "KSamplerAdvanced", "inputs": {
            "model": ["3", 0], "positive": ["4", 0], "negative": ["7", 0],
            "latent_image": ["12", 0], "add_noise": "enable", "noise_seed": seed,
            "steps": steps, "cfg": 8, "sampler_name": "dpmpp_2m", "scheduler": "karras",
            "start_at_step": int(steps * (1 - args.denoise)), "end_at_step": steps,
            "return_with_leftover_noise": "disable",
        }},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "regen_test"}},
    }

    res = cg.http_post(f"{BASE}/prompt", {"prompt": workflow})
    pid = res.get("prompt_id")
    if not pid:
        print("QUEUE ERROR:", json.dumps(res)[:400])
        sys.exit(1)
    print("queued:", pid, "seed:", seed)
    for _ in range(150):
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
