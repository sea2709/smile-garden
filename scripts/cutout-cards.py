"""Cut the painted UI cards out of their paper backdrop (transparent corners).

Flood-fills from the image border through pixels that match the backdrop
paper colour, makes them transparent and feathers the edge. Run on the
assets/ui/*.png files in place.
"""
import glob, os
import numpy as np
from PIL import Image
from scipy import ndimage

here = os.path.join(os.path.dirname(__file__), '..', 'assets', 'ui')
for f in sorted(glob.glob(os.path.join(here, '*.png'))):
    im = np.asarray(Image.open(f).convert('RGBA')).astype(np.float32)
    rgb = im[..., :3]
    H, W = rgb.shape[:2]
    border = np.concatenate([rgb[:3].reshape(-1, 3), rgb[-3:].reshape(-1, 3), rgb[:, :3].reshape(-1, 3), rgb[:, -3:].reshape(-1, 3)])
    ref = np.median(border, axis=0)
    d = np.sqrt(((rgb - ref) ** 2).sum(axis=2))
    bgish = d < 14
    lab, n = ndimage.label(bgish)
    edge_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outside = np.isin(lab, list(edge_labels))
    outside = ndimage.binary_opening(outside, iterations=1)
    inside = ~outside
    inside = ndimage.binary_fill_holes(inside)
    # keep the largest blob (the card)
    lab2, n2 = ndimage.label(inside)
    if n2 > 1:
        sizes = ndimage.sum(inside, lab2, range(1, n2 + 1))
        inside = lab2 == (np.argmax(sizes) + 1)
    alpha = ndimage.gaussian_filter(inside.astype(np.float32), 1.2) * 255
    out = np.dstack([rgb, np.minimum(im[..., 3], alpha)]).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(f, optimize=True)
    print(os.path.basename(f), 'ref', ref.round(), 'kept', round(inside.mean(), 3))
