"""Remove the pale paper fringe ("soil halo") around the painted plant sprites.

Reads art/plants/<id>/stage-N.png (override with ART_SRC) and
writes assets/plants/<id>/stage-N.png. Only pixels within a few px of the
transparent edge that look like warm, light, unsaturated paper are faded out
and their colour is un-mixed from the paper tone; interior highlights stay.
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

_SRC_DEFAULT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'art', 'plants'))
SRC = os.environ.get('ART_SRC', _SRC_DEFAULT)
DST = os.path.join(os.path.dirname(__file__), '..', 'assets', 'plants')
PAPER = np.array([246, 238, 216], dtype=np.float32)

def fix(path_in, path_out):
    im = np.asarray(Image.open(path_in).convert('RGBA')).astype(np.float32)
    rgb, a = im[..., :3], im[..., 3]
    # Fill small see-through holes inside fruit (lost specular highlights)
    # with a soft highlight colour; real gaps between leaves stay open.
    filled = ndimage.binary_fill_holes(a >= 24)
    holes = filled & (a < 230)
    lab, n = ndimage.label(holes)
    if n:
        sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
        rg = ndimage.uniform_filter(np.where(a >= 24, rgb[..., 0] - rgb[..., 1], 0), 15)
        for idx in range(1, n + 1):
            if sizes[idx - 1] > 600:
                continue
            m = lab == idx
            ring = ndimage.binary_dilation(m, iterations=3) & ~m
            if ring.any() and rg[ring].mean() > 45:
                rgb[m] = (252, 238, 226)
                a[m] = 255
    solid = a >= 24
    dist = ndimage.distance_transform_edt(solid)
    band = solid & (dist <= 9)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = rgb.mean(axis=2)
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1)
    paperish = (r >= g - 4) & (g >= b) & (sat < 0.30) & (lum > 150)
    # 0 at lum<=150, 1 at lum>=228
    k = np.clip((lum - 150) / 78.0, 0, 1)
    k = np.where(paperish & band, k, 0)
    # fade toward the very edge more strongly
    k = k * np.clip(1.25 - dist / 12.0, 0, 1)
    # interior gaps between leaves that still show the paper backdrop
    dp = np.sqrt(((rgb - PAPER) ** 2).sum(axis=2))
    redness = ndimage.maximum_filter(ndimage.uniform_filter(np.where(solid, r - g, 0), 9), 15)
    gap = solid & (dp < 26) & (g - b > 10) & (redness < 45)  # keep highlights on fruit
    k = np.maximum(k, np.where(gap, np.clip((26 - dp) / 12.0, 0, 1), 0))
    k = ndimage.gaussian_filter(k, 0.6)
    keep = 1 - k
    # un-mix paper from the colour so the remaining pixel is not pale
    fg = (rgb - (k[..., None]) * PAPER) / np.maximum(keep[..., None], 0.25)
    fg = np.clip(fg, 0, 255)
    new_rgb = np.where((k > 0.02)[..., None], fg, rgb)
    new_a = a * keep
    # tone down the remaining pale dusty rim of the soil mound toward soil brown
    ys = np.arange(a.shape[0])[:, None] * np.ones((1, a.shape[1]))
    base = np.max(np.where(solid.any(axis=1))[0])
    soil_zone = ys > base - 90
    lum2 = new_rgb.mean(axis=2)
    mx2, mn2 = new_rgb.max(axis=2), new_rgb.min(axis=2)
    sat2 = (mx2 - mn2) / np.maximum(mx2, 1)
    rim = soil_zone & solid & (dist <= 14) & (sat2 < 0.42) & (lum2 > 120)
    t = np.clip((lum2 - 120) / 90.0, 0, 1) * np.clip(1.2 - dist / 14.0, 0, 1) * 0.75
    t = ndimage.gaussian_filter(np.where(rim, t, 0), 0.8)
    SOIL = np.array([112, 82, 56], dtype=np.float32)
    new_rgb = new_rgb * (1 - t[..., None]) + SOIL * t[..., None]
    # drop dust: tiny isolated specks left after fading
    lab, n = ndimage.label(new_a > 40)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(new_a), lab, range(1, n + 1))
        small = np.isin(lab, np.where(sizes < 30)[0] + 1)
        new_a[small] = 0
    # 1px soft edge
    soft = ndimage.gaussian_filter(new_a, 0.7)
    new_a = np.minimum(new_a, soft * 1.15)
    out = np.dstack([new_rgb, np.clip(new_a, 0, 255)]).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(path_out, optimize=True)

for pid in sorted(os.listdir(SRC)):
    d = os.path.join(SRC, pid)
    if not os.path.isdir(d):
        continue
    os.makedirs(os.path.join(DST, pid), exist_ok=True)
    for s in range(1, 6):
        fix(os.path.join(d, f'stage-{s}.png'), os.path.join(DST, pid, f'stage-{s}.png'))
    print('defringed', pid)
