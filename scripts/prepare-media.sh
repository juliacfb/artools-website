#!/usr/bin/env bash
# ==========================================================================
# ARTOOLS — preparo de mídia a partir de assets/raw_files/
# Requisitos: ffmpeg (com libwebp e libx264) e Python 3 com Pillow, NumPy e SciPy
# Uso:   bash scripts/prepare-media.sh        (rodar na raiz do projeto)
# ==========================================================================
set -euo pipefail

SRC="assets/raw_files/video_pen_writing.mp4"   # 1920×1080 · 24 fps · 10 s · 240 quadros
PHOTO="assets/raw_files/IMG_6395 Grande.jpeg"

mkdir -p assets/frames/lg assets/frames/sm assets/video assets/img

# --- Opção A: sequência de quadros WebP (desenhada em <canvas>) -------------
# Mantemos os 24 fps nativos: subir para 30 fps só duplicaria quadros (mais peso, zero fluidez).
# lg = desktop/tablet (≈41 KB/quadro, 9,8 MB no total) · sm = celular / economia de dados (≈18 KB, 4,3 MB)
ffmpeg -y -i "$SRC" -vf "scale=1920:-2" -c:v libwebp -quality 72 -compression_level 6 assets/frames/lg/frame_%04d.webp
ffmpeg -y -i "$SRC" -vf "scale=960:-2"  -c:v libwebp -quality 70 -compression_level 6 assets/frames/sm/frame_%04d.webp

# --- Opção B (fallback): MP4 com keyframe em TODOS os quadros (-g 1) ----------
# Sem -g 1 o navegador precisa decodificar desde o último keyframe a cada seek e o scrub "trava".
ffmpeg -y -i "$SRC" -vf "scale=1920:-2" -c:v libx264 -preset slow -g 1 -crf 22 -pix_fmt yuv420p \
       -movflags +faststart -an assets/video/video_scrub.mp4

# --- Imagens estáticas -------------------------------------------------------
# Caneta do hero: recorte do quadro 0 (fundo #FDFDFD → alfa). É o mesmo quadro que abre o filme,
# o que permite o "handoff" exato da caneta do hero para o vídeo.
ffmpeg -y -i "$SRC" -vf "select=eq(n\,0)" -frames:v 1 /tmp/artools_frame0.png
python3 -I scripts/cutout_pen.py /tmp/artools_frame0.png assets/img/pen-hero.webp
# Vista lateral horizontal para a anatomia do produto (derivada do recorte acima)
python3 -I scripts/pen_horizontal.py

ffmpeg -y -ss 1.05 -i "$SRC" -frames:v 1 -vf "crop=1200:900:300:40" -c:v libwebp -quality 80 assets/img/still-nib.webp
ffmpeg -y -ss 9.95 -i "$SRC" -frames:v 1 -vf "scale=1600:-2" -c:v libwebp -quality 80 assets/img/still-writing.webp
ffmpeg -y -i "$PHOTO" -c:v libwebp -quality 80 assets/img/pen-desk.webp
ffmpeg -y -i assets/frames/lg/frame_0001.webp -vf "scale=1200:-2" -q:v 4 assets/img/og.jpg

echo "Mídia pronta."
