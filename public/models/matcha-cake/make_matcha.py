"""Recolor the Sketchfab 'Strawberry cake' glTF into a matcha cake.

Textures are remapped in HSV so all the painted shading, seeds, drips and
brush detail survive - only the hue/saturation move into the matcha band.
Untextured materials get their baseColorFactor swapped (glTF factors are
linear, so sRGB targets are converted).
"""
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# Point these at the unzipped Sketchfab model and the folder to write.
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "strawberry_cake")
DST = Path(sys.argv[2] if len(sys.argv) > 2 else "matcha_cake")

# Set to True for a matcha cake that still has red strawberries on top.
KEEP_BERRIES = False

# ---------------------------------------------------------------- textures
# mode 'shift'  : move every pixel's hue into the matcha band
# mode 'stripe' : only recolor pixels inside a hue window (keeps the base tone)
# mode 'keep'   : leave alone
TEX_RULES = {
    # cake sponge: warm tan -> matcha sponge
    "Material.003_baseColor.png": dict(mode="shift", hue=0.215, compress=0.55,
                                       sat=1.15, val=0.93),
    # pink glaze on the top tier -> matcha glaze
    "Material.002_baseColor.png": dict(mode="shift", hue=0.225, compress=0.5,
                                       sat=1.30, val=0.94),
    # strawberries -> matcha-glazed berries
    "Material.001_baseColor.png": dict(mode="shift", hue=0.235, compress=0.45,
                                       sat=0.90, val=0.82),
    # cream filling: stays cream, just loses the pink cast
    "Material.004_baseColor.png": dict(mode="shift", hue=0.195, compress=0.4,
                                       sat=0.85, val=1.0),
    # mug of milk -> keep it cream, it reads as the milk in a matcha latte
    "Material.008_baseColor.png": dict(mode="keep"),
    # yellow drink -> matcha latte
    "Material.009_baseColor.png": dict(mode="shift", hue=0.215, compress=0.5,
                                       sat=0.75, val=0.90),
    # leaves: already green, just deepen a touch
    "Material.007_baseColor.png": dict(mode="shift", hue=0.245, compress=0.9,
                                       sat=1.05, val=0.95),
    # patterned plate: peach base + orange squiggles -> pale matcha
    "Material.010_baseColor.png": dict(mode="shift", hue=0.210, compress=0.45,
                                       sat=0.95, val=0.98),
    # placemat: keep the tan board, turn the red stripes green
    "Material.012_baseColor.png": dict(mode="stripe", hue=0.225, sat=0.85,
                                       val=0.95, lo=0.90, hi=0.06, min_sat=0.35),
}

# ------------------------------------------------------- untextured colors
def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def hex_linear(h):
    h = h.lstrip("#")
    rgb = np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)]) / 255.0
    return [round(float(v), 6) for v in srgb_to_linear(rgb)] + [1.0]


FACTOR_RULES = {
    "Material.005": "#4f7a2a",  # jam layer between tiers -> matcha ganache
    "Material.011": "#f2f6e6",  # cake stand -> soft matcha cream
    "Material.006": "#7ba63c",  # glossy drip glaze -> matcha glaze
}


def recolor(path_in, path_out, rule):
    img = Image.open(path_in)
    has_alpha = img.mode in ("RGBA", "LA") or "transparency" in img.info
    alpha = img.convert("RGBA").split()[3] if has_alpha else None

    hsv = np.asarray(img.convert("RGB").convert("HSV"), dtype=np.float32) / 255.0
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]

    if rule["mode"] == "stripe":
        lo, hi = rule["lo"], rule["hi"]
        band = (h >= lo) | (h <= hi)  # wraps through red
        mask = band & (s >= rule["min_sat"])
    else:
        mask = np.ones_like(h, dtype=bool)

    if not mask.any():
        shutil.copy(path_in, path_out)
        return

    if rule["mode"] == "shift":
        # centre the hue distribution, then compress it around the matcha hue
        ref = np.median(h[s > 0.12]) if (s > 0.12).any() else np.median(h)
        delta = (h - ref + 0.5) % 1.0 - 0.5
        h_new = (rule["hue"] + delta * rule["compress"]) % 1.0
    else:
        h_new = np.full_like(h, rule["hue"])

    h = np.where(mask, h_new, h)
    s = np.where(mask, np.clip(s * rule["sat"], 0, 1), s)
    v = np.where(mask, np.clip(v * rule["val"], 0, 1), v)

    out = np.stack([h, s, v], axis=-1)
    out = (np.clip(out, 0, 1) * 255).astype(np.uint8)
    result = Image.fromarray(out, mode="HSV").convert("RGB")
    if alpha is not None:
        result = result.convert("RGBA")
        result.putalpha(alpha)
    result.save(path_out)


def main():
    if KEEP_BERRIES:
        TEX_RULES["Material.001_baseColor.png"] = dict(mode="keep")
    if DST.exists():
        shutil.rmtree(DST)
    (DST / "textures").mkdir(parents=True)

    shutil.copy(SRC / "scene.bin", DST / "scene.bin")

    for tex in sorted((SRC / "textures").glob("*.png")):
        rule = TEX_RULES.get(tex.name, dict(mode="keep"))
        if rule["mode"] == "keep":
            shutil.copy(tex, DST / "textures" / tex.name)
            print(f"  kept    {tex.name}")
        else:
            recolor(tex, DST / "textures" / tex.name, rule)
            print(f"  matcha  {tex.name}  ({rule['mode']})")

    gltf = json.loads((SRC / "scene.gltf").read_text())
    gltf["asset"].setdefault("extras", {})["title"] = "Matcha cake"
    for m in gltf.get("materials", []):
        target = FACTOR_RULES.get(m.get("name"))
        if target:
            m.setdefault("pbrMetallicRoughness", {})["baseColorFactor"] = hex_linear(target)
            print(f"  factor  {m['name']} -> {target}")
    (DST / "scene.gltf").write_text(json.dumps(gltf, separators=(",", ":")))

    shutil.copy(SRC / "license.txt", DST / "license.txt")
    (DST / "CREDITS.txt").write_text(
        "Matcha cake\n"
        "-----------\n"
        "Recolored derivative of \"Strawberry cake\"\n"
        "(https://sketchfab.com/3d-models/strawberry-cake-79762ddaa1c047f595243c1f68a66bd7)\n"
        "by Polybyheart (https://sketchfab.com/Polybyheart),\n"
        "licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).\n\n"
        "Only the base color textures and material base color factors were changed;\n"
        "geometry, UVs and scene graph are untouched. Credit must stay with the model.\n"
    )
    print("done ->", DST)


if __name__ == "__main__":
    main()
