# ARTOOLS Precision Pen — landing page

Landing page da Pigmentum 0.1 construída sobre o **Architect DS** (v3 `design_system_new.html` + v4 `design_system_new2.html`).

```
public/                     ← pasta publicada (raiz do site)
  index.html
  robots.txt
  css/style.css             tokens → base → layout → componentes → seções → animações → utilitários → responsivo
  js/main.js                Lenis · sequência de frames · preloader · hero · filme · reveals · trilho · cursor · botões
  assets/img/               caneta recortada (hero), stills de produto, og.jpg
  assets/frames/lg|sm/      240 quadros WebP (1920 e 960 px) para o scroll scrub
  assets/video/             video_scrub.mp4 (fallback, keyframe em todo quadro)
design/                     referências — NÃO vai para o ar
  design_systems/           Architect DS v3 (design_system_new.html) e v4 (design_system_new2.html)
  digital-architect.aura.build/ · animations-gemini/ · animations-gemini2/   templates de origem
media-src/                  vídeos e fotos brutos (entrada dos scripts) — NÃO vai para o ar
scripts/                    prepare-media.sh (ffmpeg) · cutout_pen.py (recorte) · pen_horizontal.py (vista lateral)
```

## Rodar localmente

O site **precisa de servidor HTTP**: via `file://` o navegador bloqueia o carregamento dos quadros e o canvas.

```bash
npx serve public                          # ou
python -m http.server 8000 -d public      # e abra http://localhost:8000
```

## Deploy

Site estático, sem etapa de build. Publique **somente a pasta `public/`**:

| Plataforma | Configuração |
|---|---|
| Netlify / Cloudflare Pages | build command: vazio · publish directory: `public` |
| Vercel | Framework: Other · Output Directory: `public` |
| GitHub Pages | via Actions, publicando `public/` (o modo "branch" só aceita `/` ou `/docs`) |

Antes de publicar:
- **`og:image`** precisa de URL absoluta para aparecer no WhatsApp/LinkedIn etc.: troque `assets/img/og.jpg` por `https://SEU-DOMINIO/assets/img/og.jpg` em `public/index.html` e, se quiser, adicione `<link rel="canonical">` e `og:url`.
- Os links de Suporte e Social do rodapé ainda apontam para `#comprar` (provisórios).

## Preparar a mídia (já está gerada no repositório)

```bash
bash scripts/prepare-media.sh
```

Comandos principais:

```bash
# Opção A (usada) — sequência WebP desenhada em <canvas>; fps nativo do vídeo (24) = 240 quadros
ffmpeg -i media-src/video_pen_writing.mp4 -vf "scale=1920:-2" -c:v libwebp -quality 72 public/assets/frames/lg/frame_%04d.webp
ffmpeg -i media-src/video_pen_writing.mp4 -vf "scale=960:-2"  -c:v libwebp -quality 70 public/assets/frames/sm/frame_%04d.webp

# Opção B (fallback automático se os quadros falharem) — keyframe em TODOS os quadros, senão o scrub trava
ffmpeg -i media-src/video_pen_writing.mp4 -c:v libx264 -g 1 -crf 22 -pix_fmt yuv420p -movflags +faststart -an public/assets/video/video_scrub.mp4
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
- **Só tema claro**: o site não tem modo escuro (força `color-scheme: light`, mesmo com o sistema em escuro).

## Conteúdo provisório

Especificações e números (peso 9 g, 140 mm, secagem < 3 s, 400 m, "troca em 30 dias") são **placeholders plausíveis** — confirme com o time de produto antes de publicar.
