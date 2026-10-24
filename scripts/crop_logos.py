#!/usr/bin/env python3
"""Recorta los logos JPG del repo (no cuadrados, arte a sangre completa):
   - Finder/Calculator/Axcgames: cuadrar por REPLICACIÓN de bordes (sin perder arte)
   - PNGs ya cuadrados con alfa (safari/notes/settings): trim de alfa + reencuadre
   Salida: PNG 512x512 en public/icons/
   2026-10 t18: segunda tanda del usuario (Files/Navegador/Settings .jpg + Wallpaper.JPG).
   Los jobs nuevos van AL FINAL para ganar sobre los antiguos si repiten destino.
"""
from PIL import Image, ImageOps
import os

SIZE = 512
OUT = "public/icons"


def square_by_edge_replicate(im: Image.Image) -> Image.Image:
    """Cuadra una imagen replicando los píxeles del borde más corto."""
    w, h = im.size
    if w == h:
        return im
    rgb = im.convert("RGB")
    if w > h:  # falta alto: replica filas superior/inferior
        side = w - h
        top = rgb.crop((0, 0, w, 1)).resize((w, side // 2 + 1), Image.NEAREST)
        bot = rgb.crop((0, h - 1, w, h)).resize((w, side - side // 2 + 1), Image.NEAREST)
        nh = h + side
        canvas = Image.new("RGB", (w, nh))
        canvas.paste(top, (0, 0))
        canvas.paste(rgb, (0, top.height))
        canvas.paste(bot, (0, top.height + h))
        return canvas
    # falta ancho: replica columnas izquierda/derecha
    side = h - w
    left = rgb.crop((0, 0, 1, h)).resize((side // 2 + 1, h), Image.NEAREST)
    right = rgb.crop((w - 1, 0, w, h)).resize((side - side // 2 + 1, h), Image.NEAREST)
    nw = w + side
    canvas = Image.new("RGB", (nw, h))
    canvas.paste(left, (0, 0))
    canvas.paste(rgb, (left.width, 0))
    canvas.paste(right, (left.width + w, 0))
    return canvas


def alpha_icon(im: Image.Image, inner: float = 0.92) -> Image.Image:
    """PNG cuadrado con alfa: recorta bordes transparentes y reencuadra al centro."""
    bbox = im.getchannel("A").point(lambda a: 255 if a >= 10 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    target = int(SIZE * inner)
    w, h = im.size
    scale = min(target / w, target / h)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    resized = im.resize((nw, nh), Image.LANCZOS)
    canvas.paste(resized, ((SIZE - nw) // 2, (SIZE - nh) // 2), resized)
    return canvas


jobs = [
    ("Finder_logo.jpg", "finder.png", "replicate"),
    ("Calculator_logo.jpg", "calculator.png", "replicate"),
    ("Axcgames_logo.jpg", "axcgames.png", "replicate"),
    ("Safari_logo.PNG", "safari.png", "alpha"),
    ("Notes_logo.PNG", "notes.png", "alpha"),
    ("Settings_logo.PNG", "settings.png", "alpha"),
    # t18: logos nuevos del usuario (subidos al repo) — al final para ganar
    ("Files.jpg", "finder.png", "replicate"),
    ("Navegador.jpg", "safari.png", "replicate"),
    ("Settings.jpg", "settings.png", "replicate"),
]

for src, dst, mode in jobs:
    im = ImageOps.exif_transpose(Image.open(src))
    if mode == "replicate":
        sq = square_by_edge_replicate(im).resize((SIZE, SIZE), Image.LANCZOS).convert("RGB")
    else:
        sq = alpha_icon(im.convert("RGBA"))
    sq.save(os.path.join(OUT, dst), "PNG")
    print(f"{src} {im.size} -> {dst} {sq.size} ({mode})")

# --- t18: fondo de pantalla predeterminado nuevo (Wallpaper.JPG -> axcnavy.png) ---
# Mismo formato que los wallpapers existentes: bytes JPEG con extensión .png
# (idéntico mecanismo que goldengate.png y compañía en el sitio en vivo).
wp_src = "Wallpaper.JPG"
wp_dst = os.path.join("public", "wallpapers", "axcnavy.png")
wp = ImageOps.exif_transpose(Image.open(wp_src)).convert("RGB")
wp.save(wp_dst, "JPEG", quality=88, optimize=True)  # re-guardar sin EXIF, ligero
print(f"{wp_src} {wp.size} -> {wp_dst} {os.path.getsize(wp_dst)//1024}KB")

print("OK")
