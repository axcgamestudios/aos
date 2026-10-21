#!/usr/bin/env python3
"""Vectoriza el logo pera (PNG transparente) a un path SVG suave."""
import numpy as np
from PIL import Image
from skimage import measure

img = Image.open('/home/z/my-project/download/axcsOS-logo.png').convert('RGBA')
alpha = np.array(img.split()[-1]) > 128  # máscara binaria
h, w = alpha.shape
print('dimensiones máscara:', w, 'x', h)

# Contornos con marching squares (level 0.5 sobre float)
contours = measure.find_contours(alpha.astype(float), 0.5)
print('contornos encontrados:', len(contours))

def rdp_simplify(pts, tol):
    """Ramer-Douglas-Peucker iterativo."""
    if len(pts) < 3:
        return pts
    stack = [(0, len(pts) - 1)]
    keep = np.zeros(len(pts), dtype=bool)
    keep[0] = keep[-1] = True
    while stack:
        s, e = stack.pop()
        if e <= s + 1:
            continue
        seg = pts[s:e + 1]
        a, b = pts[s], pts[e]
        ab = b - a
        L = np.hypot(*ab)
        if L == 0:
            d = np.hypot(*(seg - a).T)
        else:
            d = np.abs(np.cross(np.append(ab, 0), np.append(seg - a, 0, axis=-1) if seg.ndim == 2 else None)[..., 2]) if False else np.abs(ab[0] * (seg[:, 1] - a[1]) - ab[1] * (seg[:, 0] - a[0])) / L
        i = s + 1 + int(np.argmax(d[1:-1])) + 0
        i = int(i)
        if d[1:-1].max() > tol:
            keep[i] = True
            stack.append((s, i))
            stack.append((i, e))
    return pts[keep]

def catmull_rom_to_bezier(pts, closed=True):
    """Convierte polígono suavizado a curvas cúbicas Bézier (Catmull-Rom)."""
    n = len(pts)
    if n < 3:
        return ''
    # factor de tensión (1 = Catmull-Rom estándar)
    t = 0.85
    cmds = [f'M {pts[0][0]:.1f} {pts[0][1]:.1f}']
    for i in range(n if closed else n - 1):
        p0 = pts[(i - 1) % n] if closed else pts[max(0, i - 1)]
        p1 = pts[i % n]
        p2 = pts[(i + 1) % n] if closed else pts[min(n - 1, i + 1)]
        p3 = pts[(i + 2) % n] if closed else pts[min(n - 1, i + 2)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6.0 * t, p1[1] + (p2[1] - p0[1]) / 6.0 * t)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6.0 * t, p2[1] - (p3[1] - p1[1]) / 6.0 * t)
        cmds.append(f'C {c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}')
    if closed:
        cmds.append('Z')
    return ' '.join(cmds)

paths = []
for c in contours:
    # contornos vienen como (fila, col) -> invertir a (x, y)
    pts = np.column_stack([c[:, 1], c[:, 0]])
    # descartar ruido diminuto
    area = 0.5 * abs(np.dot(pts[:, 0], np.roll(pts[:, 1], 1)) - np.dot(pts[:, 1], np.roll(pts[:, 0], 1)))
    if area < 30:
        continue
    # orientación: find_contours da contornos exteriores CCW? normalizar para evenodd (da igual)
    simp = rdp_simplify(pts, tol=1.6)
    d = catmull_rom_to_bezier(simp, closed=True)
    if d:
        paths.append(d)

# Unir todos los subpaths
d_path = ' '.join(paths)
print('subpaths:', len(paths))

# Calcular bbox aproximado desde contornos
xs, ys = [], []
for c in contours:
    if len(c) > 2:
        xs.append(c[:, 1].min()); xs.append(c[:, 1].max())
        ys.append(c[:, 0].min()); ys.append(c[:, 0].max())
x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
print(f'bbox: x[{x0:.0f},{x1:.0f}] y[{y0:.0f},{y1:.0f}]')

with open('/home/z/my-project/scripts/pear_path.txt', 'w') as f:
    f.write(d_path)
print('path chars:', len(d_path))
print(d_path[:600])
