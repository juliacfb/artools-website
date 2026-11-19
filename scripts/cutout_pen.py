"""Recorta a caneta do quadro 0 do vídeo (fundo ~#FDFDFD) gerando um WebP com alfa.
Uso: python -I scripts/cutout_pen.py <frame.png> <saida.webp>
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(np.float32)
bg = 253.0
# distância ao fundo: o corpo da caneta é branco, mas tem sombreado/contorno cinza
dist = bg - a.min(axis=2)
mask = dist > 6
mask = ndi.binary_closing(mask, structure=np.ones((9, 9)), iterations=2)
mask = ndi.binary_fill_holes(mask)
lab, n = ndi.label(mask)
sizes = ndi.sum(mask, lab, range(1, n + 1))
keep = 1 + int(np.argmax(sizes))          # maior componente = caneta (sombra fica de fora)
mask = lab == keep
mask = ndi.binary_erosion(mask, iterations=1)
alpha = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.1))
rgba = im.copy(); rgba.putalpha(alpha)
bbox = alpha.getbbox()
pad = 8
bbox = (max(bbox[0]-pad,0), max(bbox[1]-pad,0), min(bbox[2]+pad,im.width), min(bbox[3]+pad,im.height))
rgba = rgba.crop(bbox)
rgba.save(out, "WEBP", quality=90, method=6)
print("bbox", bbox, "size", rgba.size, "components", n)
