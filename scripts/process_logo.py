#!/usr/bin/env python3
"""Convierte axcsOS.png (pera gris sobre blanco) a PNG transparente optimizado."""
from PIL import Image
import base64, io

im = Image.open('/home/z/my-project/upload/axcsOS.png').convert('RGBA')
w, h = im.size
px = im.load()

out = Image.new('RGBA', (w, h))
opx = out.load()

# Pera: gris ~128. Blanco: 255. Anti-alias entre 128 y 255.
GRAY = 128.0
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        lum = (r + g + b) / 3.0
        if lum >= 250:            # blanco puro -> transparente
            opx[x, y] = (128, 128, 124, 0)
        elif lum <= GRAY + 12:    # interior pera -> opaco
            opx[x, y] = (128, 128, 124, 255)
        else:                     # borde anti-aliased -> alpha proporcional
            alpha = int(max(0.0, min(1.0, (255.0 - lum) / (255.0 - GRAY))) * 255)
            # mezclar color blanco->gris según alpha para evitar halo
            t = alpha / 255.0
            col = int(255 * (1 - t) + 128 * t)
            opx[x, y] = (128, 128, 124, alpha)

# Recortar al contenido
bbox = out.getbbox()
out = out.crop(bbox)
print('bbox:', bbox, 'size:', out.size)

# Redimensionar a altura 480 (nitido, tamaño razonable)
target_h = 480
ratio = target_h / out.size[1]
target_w = int(out.size[0] * ratio)
out = out.resize((target_w, target_h), Image.LANCZOS)

# Optimizar: paleta con transparencia
out_opt = out.quantize(colors=64, method=Image.FASTOCTREE)
buf = io.BytesIO()
out_opt.save(buf, format='PNG', optimize=True)
data = buf.getvalue()
print('PNG optimizado:', len(data), 'bytes')
print('base64:', len(base64.b64encode(data)), 'chars')

with open('/home/z/my-project/scripts/axcs_logo.b64', 'w') as f:
    f.write(base64.b64encode(data).decode())

# Version blanca (para fondos claros si hiciera falta) y version grande PNG de respaldo
out.save('/home/z/my-project/download/axcsOS-logo.png')
print('guardado /home/z/my-project/download/axcsOS-logo.png')
