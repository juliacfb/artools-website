"""Gera public/assets/img/pen-horizontal.webp a partir de pen-hero.webp (alfa preservado).

1. Mede o eixo da caneta por PCA do canal alfa e gira até a horizontal
   (em alfa pré-multiplicado, para o bicúbico não puxar o branco do fundo original).
2. Reconstrói a silhueta do CORPO (cilindro reto, entre a emenda da tampa e a ponta traseira):
   ajusta retas às bordas superior/inferior e gera uma faixa com antialias. O recorte vindo do
   vídeo tinha a borda inferior ondulada pelo fosco/sombra, que vira serrilhado no tema escuro.
3. Defranja leve no restante (tampa, clipe, extremidades).

Uso: python -I scripts/pen_horizontal.py
"""
import numpy as np
from PIL import Image, ImageFilter

src = Image.open("public/assets/img/pen-hero.webp").convert("RGBA")
a = np.asarray(src)[..., 3]
ys, xs = np.nonzero(a > 128)
pts = np.stack([xs, ys], 1).astype(float)
_, _, vt = np.linalg.svd(pts - pts.mean(0), full_matrices=False)
angle = np.degrees(np.arctan2(vt[0, 1], vt[0, 0]))

rot = src.convert("RGBa").rotate(angle, resample=Image.BICUBIC, expand=True).convert("RGBA")
bbox = rot.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
pad = 6
rot = rot.crop((bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad))
W, H = rot.size

# defranja geral (~1px)
alpha = rot.getchannel("A").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
A = np.asarray(alpha).astype(np.float32) / 255.0

# corpo: da emenda da tampa (~30.5% W) até antes da ponta traseira (~95.5% W)
x0, x1 = int(W * 0.305), int(W * 0.955)
cols = np.arange(x0, x1)
solid = np.asarray(rot.getchannel("A")) > 200
top = np.array([np.argmax(solid[:, x]) for x in cols], float)
bot = np.array([H - 1 - np.argmax(solid[::-1, x]) for x in cols], float)

def robust_line(x, y):
    m = np.ones_like(y, bool)
    for _ in range(4):                       # descarta outliers (sombra/fosco) e reajusta
        k, b = np.polyfit(x[m], y[m], 1)
        r = y - (k * x + b)
        m = np.abs(r - np.median(r[m])) < 1.5 * (np.std(r[m]) + 0.5)
    return k, b

kt, bt = robust_line(cols, top)
kb, bb = robust_line(cols, bot)
inset = 1.0                                   # recua 1px para dentro do corpo
yy = np.arange(H)[:, None].astype(np.float32)
xx = cols[None, :].astype(np.float32)
t_edge = kt * xx + bt + inset
b_edge = kb * xx + bb - inset
band = np.clip(yy - t_edge + 0.5, 0, 1) * np.clip(b_edge - yy + 0.5, 0, 1)
# transição suave de 12px nas duas pontas da faixa, para não marcar emenda
ramp = np.ones(len(cols), np.float32)
n = 12
ramp[:n] = np.linspace(0, 1, n); ramp[-n:] = np.linspace(1, 0, n)
A[:, x0:x1] = A[:, x0:x1] * (1 - ramp) + band * ramp

rot.putalpha(Image.fromarray((A * 255).round().astype(np.uint8)))
rot.save("public/assets/img/pen-horizontal.webp", "WEBP", quality=90, method=6)
print(f"angle {angle:.2f} -> size {rot.size}; corpo topo {kt:.4f}x+{bt:.1f}, base {kb:.4f}x+{bb:.1f}")
