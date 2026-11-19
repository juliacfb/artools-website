# ARTOOLS Precision Pen — landing page

Landing page da Pigmentum 0.1 construída sobre o **Architect DS** (v3 `design_system_new.html` + v4 `design_system_new2.html`).

```
index.html
css/style.css        tokens → base → layout → componentes → seções → animações → utilitários → responsivo
js/main.js           tema · Lenis · sequência de frames · preloader · hero · filme · reveals · trilho · cursor · botões
assets/img/          caneta recortada (hero), stills de produto, og.jpg
assets/frames/lg|sm/ 240 quadros WebP (1920 e 960 px) para o scroll scrub
assets/video/        video_scrub.mp4 (fallback, keyframe em todo quadro)
scripts/             prepare-media.sh (ffmpeg) · cutout_pen.py (recorte) · pen_horizontal.py (vista lateral)
```

## Rodar localmente

O site **precisa de servidor HTTP**: via `file://` o navegador bloqueia o carregamento dos quadros e o canvas.

```bash
npx serve .                    # ou
python -m http.server 8000     # e abra http://localhost:8000
```

## Preparar a mídia (já está gerada no repositório)

```bash
bash scripts/prepare-media.sh
```

Comandos principais:

```bash
# Opção A (usada) — sequência WebP desenhada em <canvas>; fps nativo do vídeo (24) = 240 quadros
ffmpeg -i assets/raw_files/video_pen_writing.mp4 -vf "scale=1920:-2" -c:v libwebp -quality 72 assets/frames/lg/frame_%04d.webp
ffmpeg -i assets/raw_files/video_pen_writing.mp4 -vf "scale=960:-2"  -c:v libwebp -quality 70 assets/frames/sm/frame_%04d.webp

# Opção B (fallback automático se os quadros falharem) — keyframe em TODOS os quadros, senão o scrub trava
ffmpeg -i assets/raw_files/video_pen_writing.mp4 -c:v libx264 -g 1 -crf 22 -pix_fmt yuv420p -movflags +faststart -an assets/video/video_scrub.mp4
```

> O vídeo-fonte tem 24 fps. Extrair a 30 fps (como no exemplo do briefing) só duplicaria quadros: +25% de peso sem ganho de fluidez. A suavidade vem da interpolação (lerp) no canvas.

## Design system — como foi aplicado

Todos os valores vêm dos dois arquivos; o que precisou ser derivado está marcado no CSS com `/* derivado: ... */`.

**Divergências entre v3 e v4** (tokens, cores, fontes, easings e durações são idênticos nos dois):

| Ponto | v3 | v4 | Usado |
|---|---|---|---|
| Hero | imagem escura + texto `mix-blend-difference` | hero claro, texto à esquerda, mídia à direita | **v4** — é a composição da referência |
| Entrelinha do display | `.85` | `.88` | **.88** — mais completo e dá folga para acentos |
| Peso do parágrafo do hero | regular | `font-light` | **regular** — pedido no briefing e melhor contraste |
| Componentes | — | flow divider, data-viz (barras/gauge/linha), sombra stack-card 14px, nav dots | **v4** (superset do v3) |

**Ajustes ao DS, por exigência do briefing ou de acessibilidade:**
- Headline em **700** (o maior peso do DS — "Pesos 300 → 700"); o briefing pede extra bold, mas 800 não existe no DS.
- Nav em **mono** (o DS usa Inter 500 no nav); o briefing pede mono, e o estilo "Label / Mono" do DS cobre isso.
- Rótulos pequenos em **stone-600** (6.3:1) em vez de stone-500 (4:1 — o próprio DS limita stone-500 a texto grande).
- **Tema escuro** não existe no DS: derivado dos papéis "invertido" (bg stone-900, texto stone-200, meta stone-400, bordas stone-800).

## Conteúdo provisório

Especificações e números (peso 9 g, 140 mm, secagem < 3 s, 400 m, "troca em 30 dias") são **placeholders plausíveis** — confirme com o time de produto antes de publicar.
