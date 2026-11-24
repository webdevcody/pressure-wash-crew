"""
Bakes the yard's tiling textures (grass, concrete, block wall, wood) into
src/assets/textures/yard/. Everything is procedural and seeded, so the output is
reproducible and there is no third-party licensing to track.

    pip install numpy scipy pillow
    python3 scripts/textures/gen_yard_textures.py

Every texture tiles seamlessly: noise is made periodic with FFT filtering and
all strokes are drawn wrapped around the edges.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "src", "assets", "textures", "yard")
os.makedirs(OUT, exist_ok=True)


def periodic_noise(rng, h, w, scale, power=2.0):
    """Tileable fractal noise in [0,1]. `scale` ~ size of the biggest blobs in px."""
    white = rng.standard_normal((h, w))
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1.0
    spectrum = 1.0 / np.power(np.maximum(f, 1.0 / scale), power)
    spectrum[0, 0] = 0
    n = np.real(np.fft.ifft2(np.fft.fft2(white) * spectrum))
    n -= n.min()
    return n / n.max()


def blur_wrap(a, sigma):
    from scipy.ndimage import gaussian_filter
    return gaussian_filter(a, sigma, mode="wrap")


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5 * strength
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5 * strength
    # Image rows go down, UV v goes up: flip dy so the normal map is OpenGL style.
    nx, ny, nz = -dx, dy, np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    n = np.stack([nx / l, ny / l, nz / l], axis=-1)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)


def save_rgb(arr, name, quality=82):
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    path = os.path.join(OUT, name)
    img.save(path, quality=quality, optimize=True, progressive=True)
    print(f"{name}: {os.path.getsize(path) // 1024} KB")


def save_gray_png(arr, name):
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "L")
    path = os.path.join(OUT, name)
    img.save(path, optimize=True)
    print(f"{name}: {os.path.getsize(path) // 1024} KB")


def lerp(a, b, t):
    return a + (b - a) * t


def wrapped(draw_fn, size, x, y, margin):
    """Call draw_fn at (x,y) and at its wrapped copies near the edges."""
    for ox in (-size, 0, size):
        for oy in (-size, 0, size):
            px, py = x + ox, y + oy
            if -margin <= px <= size + margin and -margin <= py <= size + margin:
                draw_fn(px, py)


# --------------------------------------------------------------------------
# Grass: top-down lawn. 1024 px over 2.5 m.
# --------------------------------------------------------------------------
def grass(seed=1, size=1024):
    rng = np.random.default_rng(seed)
    patches = periodic_noise(rng, size, size, 260, 2.2)
    mid = periodic_noise(rng, size, size, 60, 2.0)
    dry = np.clip((periodic_noise(rng, size, size, 200, 2.4) - 0.58) * 3.0, 0, 1)

    dark = np.array([46, 74, 30], float)
    green = np.array([82, 116, 46], float)
    yellow = np.array([128, 138, 64], float)
    soil = np.array([92, 78, 52], float)
    t = (0.55 * patches + 0.45 * mid)[..., None]
    base = lerp(dark, green, np.clip(t * 1.3, 0, 1))
    base = lerp(base, yellow, dry[..., None] * 0.6)
    # Dark under-layer with soil showing through between blades.
    under = lerp(base * 0.45, soil * 0.6, 0.35)

    img = Image.fromarray(under.astype(np.uint8), "RGB")
    hgt = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(img)
    dh = ImageDraw.Draw(hgt)
    n_blades = 90000
    xs = rng.uniform(0, size, n_blades)
    ys = rng.uniform(0, size, n_blades)
    angs = rng.uniform(0, np.pi * 2, n_blades)
    lens = rng.uniform(6, 16, n_blades)
    shade = rng.uniform(0.7, 1.35, n_blades)
    hue = rng.uniform(-1, 1, n_blades)
    for i in range(n_blades):
        x, y = xs[i], ys[i]
        xi, yi = int(x) % size, int(y) % size
        c = base[yi, xi] * shade[i]
        c = c + np.array([10, 6, -4]) * hue[i]
        # Later blades sit on top: make them brighter (lit tips).
        layer = i / n_blades
        c = c * (0.75 + 0.45 * layer)
        col = tuple(int(v) for v in np.clip(c, 0, 255))
        ex = np.cos(angs[i]) * lens[i]
        ey = np.sin(angs[i]) * lens[i]
        hv = int(60 + 195 * layer)
        w = 2 if lens[i] > 9 else 1

        def stroke(px, py):
            d.line([(px, py), (px + ex, py + ey)], fill=col, width=w)
            dh.line([(px, py), (px + ex, py + ey)], fill=hv, width=w)

        wrapped(stroke, size, x, y, 20)

    alb = np.asarray(img).astype(float)
    alb = blur_wrap(alb, (0.6, 0.6, 0))
    save_rgb(alb, "grass_albedo.jpg", 80)
    h = blur_wrap(np.asarray(hgt).astype(float) / 255.0, 1.0)
    save_rgb(normal_from_height(h, 2.5)[::2, ::2], "grass_normal.jpg", 80)

    # Large-scale tint variation, tiled at ~23 m to break up repetition.
    macro = periodic_noise(np.random.default_rng(seed + 100), 256, 256, 90, 2.3)
    save_gray_png(macro * 255, "grass_macro.png")


# --------------------------------------------------------------------------
# Concrete driveway: broom finish, aggregate, a control joint on the edges.
# 1024 px over 1.5 m x 1.75 m tile (non-square UV scale; texture is square).
# --------------------------------------------------------------------------
def concrete(seed=2, size=1024):
    rng = np.random.default_rng(seed)
    mottle = periodic_noise(rng, size, size, 300, 2.3)
    fine = periodic_noise(rng, size, size, 12, 1.2)
    # Broom finish: noise stretched along x, repeated rows.
    broom = periodic_noise(rng, size, size // 16, 4, 1.0)
    broom = np.repeat(broom, 16, axis=1)
    broom = blur_wrap(broom, (0.7, 6))

    v = 0.72 + 0.08 * (mottle - 0.5) + 0.07 * (fine - 0.5) + 0.07 * (broom - 0.5)
    # Aggregate speckles.
    speck = rng.random((size, size))
    v = np.where(speck > 0.985, v * rng.uniform(0.75, 1.2, (size, size)), v)
    v = blur_wrap(v, 0.5)

    hmap = 0.5 + 0.25 * (broom - 0.5) + 0.2 * (fine - 0.5)
    # Control joint (groove) along all four edges of the tile.
    yy, xx = np.mgrid[0:size, 0:size]
    edge = np.minimum(np.minimum(xx, size - 1 - xx), np.minimum(yy, size - 1 - yy)).astype(float)
    groove = np.clip(1 - edge / 5.0, 0, 1)
    v = v * (1 - 0.45 * groove)
    hmap = hmap - 1.2 * groove

    # A couple of hairline cracks, wrapped.
    crack = Image.new("L", (size, size), 0)
    dc = ImageDraw.Draw(crack)
    for _ in range(3):
        x, y = rng.uniform(0, size, 2)
        ang = rng.uniform(0, np.pi * 2)
        pts = [(x, y)]
        for _ in range(rng.integers(12, 30)):
            ang += rng.normal(0, 0.5)
            x += np.cos(ang) * 9
            y += np.sin(ang) * 9
            pts.append((x, y))
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                dc.line([(px + ox, py + oy) for px, py in pts], fill=255, width=1)
    cr = blur_wrap(np.asarray(crack).astype(float) / 255.0, 0.6)
    v = v * (1 - 0.35 * cr)
    hmap = hmap - 0.6 * cr

    tint = np.array([184, 180, 172], float) / 0.72
    alb = v[..., None] * tint
    save_rgb(alb, "concrete_albedo.jpg", 82)
    save_rgb(normal_from_height(hmap, 3.0)[::2, ::2], "concrete_normal.jpg", 82)


# --------------------------------------------------------------------------
# Perimeter wall: painted concrete block (CMU), 0.4 x 0.2 m blocks, running
# bond. 1024 px over a 1.6 m x 1.6 m tile (4 blocks x 8 courses).
# --------------------------------------------------------------------------
def block_wall(seed=3, size=1024):
    rng = np.random.default_rng(seed)
    px_per_m = size / 1.6
    bw, bh = int(0.4 * px_per_m), int(0.2 * px_per_m)
    mortar = 5
    yy, xx = np.mgrid[0:size, 0:size]
    row = yy // bh
    shift = np.where(row % 2 == 1, bw // 2, 0)
    bx = (xx + shift) % bw
    by = yy % bh
    col = ((xx + shift) // bw) % (size // bw)
    dist = np.minimum(np.minimum(bx, bw - 1 - bx), np.minimum(by, bh - 1 - by)).astype(float)
    joint = np.clip(1 - (dist - mortar * 0.5) / 2.5, 0, 1)
    face_round = np.clip(dist / 6.0, 0, 1)

    # Per-block tone (wrapping keyed on row/col indices so it tiles).
    nrows, ncols = size // bh, size // bw
    tones = rng.normal(0, 0.022, (nrows, ncols))
    tone = tones[row % nrows, col]

    pores = periodic_noise(rng, size, size, 6, 0.8)
    mottle = periodic_noise(rng, size, size, 220, 2.2)
    grime = periodic_noise(rng, size, size, 80, 2.0)
    # Weathering darkens toward the bottom of each 1.6 m tile slightly less
    # than a real wall would, so the tile seam isn't visible.
    v = 0.80 + tone + 0.05 * (mottle - 0.5) + 0.07 * (pores - 0.5) - 0.05 * np.clip(grime - 0.55, 0, 1)
    pits = rng.random((size, size)) > 0.992
    v = np.where(pits, v * 0.8, v)
    v = blur_wrap(v, 0.5)
    v = v * (1 - 0.32 * joint)

    # Weathering. The wall is 1.5 m tall and its UVs start at the ground, so
    # the bottom rows of this tile always sit at ground level: darken them for
    # soil splash-back, and add faint rain streaks running down from the cap.
    # Both only vary across x, so the tile still repeats seamlessly sideways.
    height_m = (size - 1 - yy) / px_per_m
    splash_n = periodic_noise(rng, size, size, 40, 1.8)
    splash = np.clip(1 - height_m / (0.12 + 0.3 * splash_n), 0, 1) ** 2.2
    streak_x = periodic_noise(rng, 1, size, 60, 2.0)[0]
    streak_x = blur_wrap(np.clip((streak_x - 0.5) * 3, 0, 1), 4)
    streak = streak_x[None, :] * np.clip((height_m - 0.4) / 1.1, 0, 1) * (0.6 + 0.4 * splash_n)
    v = v * (1 - 0.3 * splash - 0.1 * streak)

    hmap = face_round * 0.8 + 0.25 * (pores - 0.5) - 0.6 * joint
    hmap = np.where(pits, hmap - 0.3, hmap)
    paint = np.array([205, 196, 180], float) / 0.8
    soil = np.array([110, 96, 76], float) / 0.8
    alb = v[..., None] * lerp(paint, soil, (0.45 * splash)[..., None])
    save_rgb(alb, "wall_albedo.jpg", 82)
    save_rgb(normal_from_height(blur_wrap(hmap, 0.7), 3.5)[::2, ::2], "wall_normal.jpg", 82)


# --------------------------------------------------------------------------
# Fence wood: vertical planks with grain and gaps. 1024 px over 1.12 m wide
# (8 planks x 14 cm) and 1.2 m tall. Grain runs along v.
# --------------------------------------------------------------------------
def wood(seed=4, size=1024, name="wood", planks=8, base_rgb=(176, 128, 82)):
    rng = np.random.default_rng(seed)
    pw = size // planks
    yy, xx = np.mgrid[0:size, 0:size]
    plank = xx // pw
    px = xx % pw
    # Grain: noise stretched hard along y.
    g = periodic_noise(rng, size // 32, size, 30, 1.6)
    g = np.repeat(g, 32, axis=0)
    g = blur_wrap(g, (10, 0.6))
    rings = np.sin((g * 40 + plank * 1.7) * np.pi) * 0.5 + 0.5
    fine = periodic_noise(rng, size, size, 8, 1.0)
    tones = rng.normal(0, 0.07, planks)
    tone = tones[plank]
    v = 0.82 + tone + 0.10 * (rings - 0.5) + 0.06 * (fine - 0.5) + 0.08 * (g - 0.5)

    # Knots.
    for _ in range(planks):
        kx = rng.integers(0, planks) * pw + rng.uniform(0.25, 0.75) * pw
        ky = rng.uniform(0, size)
        r = rng.uniform(5, 10)
        for oy in (-size, 0, size):
            dist2 = ((xx - kx) / r) ** 2 + ((yy - ky - oy) / (r * 1.6)) ** 2
            v = v - 0.25 * np.exp(-dist2)

    # Gaps between planks.
    edge = np.minimum(px, pw - 1 - px).astype(float)
    gap = np.clip(1 - (edge - 1.5) / 1.5, 0, 1)
    v = v * (1 - 0.75 * gap)
    bevel = np.clip(edge / 4.0, 0, 1)
    hmap = 0.6 * bevel + 0.15 * (rings - 0.5) - 0.8 * gap

    alb = v[..., None] * (np.array(base_rgb, float) / 0.82)
    save_rgb(alb, f"{name}_albedo.jpg", 82)
    save_rgb(normal_from_height(blur_wrap(hmap, 0.6), 3.0)[::2, ::2], f"{name}_normal.jpg", 82)


# --------------------------------------------------------------------------
# Crate face: horizontal slats inside a frame with a diagonal brace.
# Mapped once per face (BoxGeometry UVs are 0..1 per face).
# --------------------------------------------------------------------------
def crate(seed=5, size=512):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size].astype(float)
    g = periodic_noise(rng, size, size // 16, 20, 1.6)
    g = np.repeat(g, 16, axis=1)
    g = blur_wrap(g, (0.6, 6))
    rings = np.sin(g * 30 * np.pi) * 0.5 + 0.5
    v = 0.85 + 0.08 * (rings - 0.5) + 0.08 * (g - 0.5)
    hmap = np.zeros((size, size))
    slats = 5
    sh = size / slats
    sy = (yy % sh)
    slat_edge = np.minimum(sy, sh - 1 - sy)
    gap = np.clip(1 - (slat_edge - 1) / 2, 0, 1)
    v = v * (1 - 0.6 * gap) + rng.normal(0, 0.04, slats)[(yy // sh).astype(int)]
    hmap -= gap
    f = size * 0.11
    frame = (xx < f) | (xx > size - f) | (yy < f) | (yy > size - f)
    # Diagonal brace.
    dline = np.abs(xx - yy) / np.sqrt(2)
    brace = (dline < f * 0.55) & ~frame
    raised = frame | brace
    v = np.where(raised, 0.95 + 0.08 * (rings.T - 0.5), v)
    hmap = np.where(raised, 1.0, hmap)
    edge = (np.abs(dline - f * 0.55) < 2.5) & ~frame
    for e in (np.abs(xx - f) < 2.5, np.abs(xx - (size - f)) < 2.5, np.abs(yy - f) < 2.5, np.abs(yy - (size - f)) < 2.5, edge):
        v = np.where(e, v * 0.6, v)
    nails = np.zeros((size, size), bool)
    for cx in (f / 2, size - f / 2):
        for cy in (f / 2, size - f / 2, size / 2):
            nails |= (xx - cx) ** 2 + (yy - cy) ** 2 < 16
            nails |= (yy - cx) ** 2 + (xx - cy) ** 2 < 16
    v = np.where(nails, 0.35, v)
    alb = blur_wrap(v, 0.6)[..., None] * (np.array([190, 150, 98], float) / 0.85)
    save_rgb(alb, "crate_albedo.jpg", 82)
    save_rgb(normal_from_height(blur_wrap(hmap, 1.0), 2.0)[::2, ::2], "crate_normal.jpg", 82)


if __name__ == "__main__":
    which = set(sys.argv[1:]) or {"grass", "concrete", "wall", "wood", "crate"}
    if "grass" in which:
        grass()
    if "concrete" in which:
        concrete()
    if "wall" in which:
        block_wall()
    if "wood" in which:
        wood()
    if "crate" in which:
        crate()
