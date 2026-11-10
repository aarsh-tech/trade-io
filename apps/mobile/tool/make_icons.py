"""Draws the Tradeio launcher icons (legacy PNGs for Android 6-7) from the web's brand mark.

The mark is apps/web/src/app/icon.svg: a white lightning bolt on a blue diagonal gradient tile.
Android 8+ uses the vector adaptive icon in res/mipmap-anydpi-v26 instead, so these PNGs only
matter on old phones. Re-run after changing the mark:

    python tool/make_icons.py        (from apps/mobile; needs Pillow)
"""

from pathlib import Path

from PIL import Image, ImageDraw

RES = Path(__file__).resolve().parent.parent / "android" / "app" / "src" / "main" / "res"
SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

# Same stops as the web icon's #tradeio-grad.
STOPS = [(0.0, (0x25, 0x63, 0xEB)), (0.5, (0x3B, 0x82, 0xF6)), (1.0, (0x1D, 0x4E, 0xD8))]
# Same path as the web icon, in its 64x64 viewBox.
BOLT = [(35, 11), (18, 34), (33, 34), (29, 53), (48, 29), (33, 29)]


def gradient_at(t: float) -> tuple[int, int, int]:
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        if t <= t1:
            f = (t - t0) / (t1 - t0)
            return tuple(round(a + (b - a) * f) for a, b in zip(c0, c1))
    return STOPS[-1][1]


def draw(size: int, round_icon: bool) -> Image.Image:
    ss = 8  # supersample, then downscale for smooth edges
    big = size * ss
    # Diagonal gradient: a 1-px-high ramp along t = (x + y) / 2, stretched and rotated 45°.
    n = 512
    ramp = Image.new("RGB", (n, 1))
    ramp.putdata([gradient_at(i / (n - 1)) for i in range(n)])
    diag = round(big * 1.4143) + 2
    tile = ramp.resize((diag, diag)).rotate(-45, resample=Image.BICUBIC, expand=False)
    tile = tile.crop(((diag - big) // 2, (diag - big) // 2, (diag - big) // 2 + big, (diag - big) // 2 + big))

    # Legacy icons are not masked by the launcher, so leave a margin like Android's own icons.
    inset = round(big * 0.04)
    mask = Image.new("L", (big, big), 0)
    md = ImageDraw.Draw(mask)
    box = (inset, inset, big - inset, big - inset)
    if round_icon:
        md.ellipse(box, fill=255)
    else:
        md.rounded_rectangle(box, radius=round((big - 2 * inset) * 0.25), fill=255)

    out = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    out.paste(tile, (0, 0), mask)

    scale = (big - 2 * inset) / 64
    # Optical centre: the bolt's box is x 18-48, y 11-53; nudge it into the middle of the tile.
    dx, dy = 32 - 33, 32 - 32
    pts = [(inset + (x + dx) * scale, inset + (y + dy) * scale) for x, y in BOLT]
    ImageDraw.Draw(out).polygon(pts, fill=(255, 255, 255, 255))
    return out.resize((size, size), Image.LANCZOS)


def main() -> None:
    for density, size in SIZES.items():
        folder = RES / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        draw(size, round_icon=False).save(folder / "ic_launcher.png", optimize=True)
        draw(size, round_icon=True).save(folder / "ic_launcher_round.png", optimize=True)
        print(f"{density}: {size}px")


if __name__ == "__main__":
    main()
