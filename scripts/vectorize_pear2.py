#!/usr/bin/env python3
"""Vectoriza la pera v2: upscale + blur para contornos suaves, verificación visual."""
import numpy as np
from PIL import Image, ImageFilter
from skimage import measure, draw as skdraw

img = Image.open('/home/z/my-project/download/axcsOS-logo.png').convert('RGBA')

# --- Preparar máscara suavizada a alta resolución ---
scale = 3
big = img.resize((img.width * scale, img.height * scale), Image.LANCZOS)
alpha_big = big.split()[-1].filter(ImageFilter.GaussianBlur(scale * 0.9))
mask = np.array(alpha_big).astype(float) / 255.0

contours = measure.find_contours(mask, 0.5)
print('contornos:', len(contours))

def rdp(pts, tol):
    n = len(pts)
    if n < 3:
        return pts
    keep = np.zeros(n, dtype=bool); keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        s, e = stack.pop()
        if e <= s + 1: continue
        seg = pts[s:e+1]; a, b = pts[s], pts[e]
        ab = b - a; L = np.hypot(*ab)
        if L == 0:
            d = np.hypot(*(seg - a).T)
        else:
            d = np.abs(ab[0]*(seg[:,1]-a[1]) - ab[1]*(seg[:,0]-a[0])) / L
        j = s + 1 + int(np.argmax(d[1:-1]))
        if d[1:-1].max() > tol:
            keep[j] = True; stack += [(s, j), (j, e)]
    return pts[keep]

def cr_bezier(pts, t=0.9):
    n = len(pts)
    cmds = [f'M{pts[0][0]:.1f},{pts[0][1]:.1f}']
    for i in range(n):
        p0, p1 = pts[(i-1) % n], pts[i % n]
        p2, p3 = pts[(i+1) % n], pts[(i+2) % n]
        c1 = (p1[0] + (p2[0]-p0[0])/6*t, p1[1] + (p2[1]-p0[1])/6*t)
        c2 = (p2[0] - (p3[0]-p1[0])/6*t, p2[1] - (p3[1]-p1[1])/6*t)
        cmds.append(f'C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}')
    cmds.append('Z')
    return ''.join(cmds)

paths, kept = [], []
for c in contours:
    if len(c) < 8: continue
    pts = np.column_stack([c[:, 1], c[:, 0]]) / scale  # volver a coords originales
    area = 0.5*abs(np.dot(pts[:,0], np.roll(pts[:,1],1)) - np.dot(pts[:,1], np.roll(pts[:,0],1)))
    if area < 40: continue
    simp = rdp(pts, 0.9)
    if len(simp) < 4: continue
    paths.append(cr_bezier(simp))
    kept.append((simp, area))

print('subpaths finales:', len(paths))
for p, a in kept:
    print(f'  área={a:.0f} puntos={len(p)}')

d = ''.join(paths)

# --- Render de verificación: rellenar los contornos simplificados con skimage ---
H, W = img.height, img.width
ver = np.zeros((H, W), dtype=float)
for simp, a in kept:
    rr, cc = skdraw.polygon(simp[:,1], simp[:,0], shape=(H, W))
    # área negativa (agujero) si orientación horaria
    signed = np.dot(simp[:,0], np.roll(simp[:,1],1)) - np.dot(simp[:,1], np.roll(simp[:,0],1))
    ver[rr, cc] = 1.0 if signed < 0 else -1.0
ver = np.clip(ver, 0, 1) * 255
Image.fromarray(ver.astype(np.uint8)).save('/home/z/my-project/scripts/pear_verify.png')

with open('/home/z/my-project/scripts/pear_path.txt', 'w') as f:
    f.write(d)
print('chars:', len(d))

# bbox para viewBox
allp = np.vstack([s for s, _ in kept])
print(f'viewBox="0 0 {allp[:,0].max():.0f} {allp[:,1].max():.0f}"')
