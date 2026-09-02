#!/usr/bin/env python3
"""Generic runner for a ComfyUI workflow JSON (prompt/seed swap + download).

Usage:
  python3 scripts/comfyui-workflow.py --workflow pixel-art-workflow-api.json \
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workflow", required=True)
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--negative", default=None)
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--prompt-node", default="6")
    ap.add_argument("--negative-node", default="7")
    ap.add_argument("--seed-node", default="3")
    args = ap.parse_args()

    spec = importlib.util.spec_from_file_location("cg", GEN)
    cg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cg)
    BASE = cg.BASE

    workflow = json.load(open(args.workflow))
    workflow[args.prompt_node]["inputs"]["text"] = args.prompt
    if args.negative:
        workflow[args.negative_node]["inputs"]["text"] = args.negative
    workflow[args.seed_node]["inputs"]["seed"] = args.seed if args.seed is not None else random.randint(0, 2**31 - 1)

    res = cg.http_post(f"{BASE}/prompt", {"prompt": workflow})
    pid = res.get("prompt_id")
    if not pid:
        print("QUEUE ERROR:", json.dumps(res)[:400])
        sys.exit(1)
    print("queued:", pid)

    saved = []
    for _ in range(150):
        time.sleep(2)
        try:
            hist = cg.http_get(f"{BASE}/history/{pid}")
            entry = hist.get(pid)
        except Exception:
            continue
        if entry is None:
            continue
        st = entry.get("status", {})
        if st.get("completed"):
            for out in entry.get("outputs", {}).values():
                for im in out.get("images", []):
                    url = (f"{BASE}/view?filename={im['filename']}"
                           f"&subfolder={im.get('subfolder','')}&type={im.get('type','output')}")
                    name = args.out
                    if saved:
                        name = args.out.replace(".png", f"-{len(saved)+1}.png")
                    urllib.request.urlretrieve(url, name)
                    saved.append((name, im.get("subfolder", "")))
            break
        if st.get("status_str") == "error":
            print("ERROR:", json.dumps(st)[:400])
            sys.exit(1)
    print("saved:", saved)


if __name__ == "__main__":
    main()
