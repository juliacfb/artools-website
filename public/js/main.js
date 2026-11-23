/* ==========================================================================
   ARTOOLS Precision Pen — main.js
   Seções: 0. setup · 1. easing do DS · 2. tema (só claro) · 3. Lenis · 4. sequência de
   frames · 5. preloader · 6. intro do hero · 7. hero (float/tilt/scroll) ·
   8. filme (scrub) · 9. reveals · 10. trilho/odômetro · 11. cursor ·
   12. botões magnéticos · 13. benefícios (drag) · 14. navegação · 15. boot
   ========================================================================== */
(() => {
  'use strict';

  /* ------------------------------------------------------------------------
     0. SETUP
     ------------------------------------------------------------------------ */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const root = document.documentElement;
  const body = document.body;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const MOBILE = () => innerWidth < 768;

  // Sem GSAP (CDN bloqueado/offline): mostra tudo sem animação.
  if (!window.gsap || !window.ScrollTrigger) {
    root.classList.remove('js');
    body.classList.remove('is-loading');
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  if (window.SplitText) gsap.registerPlugin(SplitText);
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  /* ------------------------------------------------------------------------
     1. EASING EXATO DO DS — cubic-bezier → função para o GSAP
     ------------------------------------------------------------------------ */
  function bezier(p1x, p1y, p2x, p2y) {
    const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
    const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
    const sx = t => ((ax * t + bx) * t + cx) * t;
    const sy = t => ((ay * t + by) * t + cy) * t;
    const dx = t => (3 * ax * t + 2 * bx) * t + cx;
    return x => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {           // Newton-Raphson
        const e = sx(t) - x;
        if (Math.abs(e) < 1e-6) return sy(t);
        const d = dx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      let lo = 0, hi = 1; t = x;               // bisseção de segurança
      while (hi - lo > 1e-6) {
        const v = sx(t);
        if (Math.abs(v - x) < 1e-6) break;
        if (x > v) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return sy(t);
    };
  }
  const EXPO = bezier(0.16, 1, 0.3, 1);        // --ease-out (ease-out-expo)
  const ELASTIC = bezier(0.34, 1.56, 0.64, 1); // --ease-elastic
  // Durações do DS (s)
  const D = { instant: 0.3, base: 0.5, slow: 1, cine: 1.2, cineLong: 1.5, stagger: 0.1 };   // stagger = --stagger (.1s)
  gsap.defaults({ ease: EXPO, duration: D.slow });

  /* ------------------------------------------------------------------------
     2. TEMA — só claro. Limpa a preferência gravada por versões antigas (tinham modo escuro).
     ------------------------------------------------------------------------ */
  try { localStorage.removeItem('artools-theme'); } catch (e) { /* storage indisponível */ }

  /* ------------------------------------------------------------------------
     3. LENIS — smooth scroll inercial integrado ao ScrollTrigger
     ------------------------------------------------------------------------ */
  let lenis = null;
  if (!REDUCED && window.Lenis) {
    lenis = new Lenis({
      duration: 1.2,
      easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.3,
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(time => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }
  window.scrollTo(0, 0);

  const headerH = () => $('.site-header').offsetHeight;
  function scrollToTarget(target) {
    if (!target) return;
    const offset = target.id === 'top' || target.classList.contains('scrub') ? 0 : -headerH() + 1;
    if (lenis) lenis.scrollTo(target, { offset, duration: 1.6, easing: EXPO });
    else window.scrollTo({ top: target.getBoundingClientRect().top + scrollY + offset, behavior: REDUCED ? 'auto' : 'smooth' });
  }

  /* ------------------------------------------------------------------------
     4. SEQUÊNCIA DE FRAMES (Opção A) com fallback de <video> (Opção B)
     ------------------------------------------------------------------------ */
  class FrameSequence {
    constructor({ canvas, count, src, coarseStep = 24 }) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.count = count;
      this.src = src;
      this.frames = new Array(count);
      this.loaded = new Uint8Array(count);
      this.loadedCount = 0;
      this.coarse = new Set();
      for (let i = 0; i < count; i += coarseStep) this.coarse.add(i);
      this.coarse.add(count - 1);
      this.coarseLoaded = 0;
      this.current = -1;
      this.wanted = 0;
      this.failed = false;
      this.listeners = { progress: [], coarse: [], fail: [] };
      this.resize = this.resize.bind(this);
    }
    on(evt, fn) { this.listeners[evt].push(fn); return this; }
    emit(evt, ...a) { this.listeners[evt].forEach(fn => fn(...a)); }

    // Ordem progressiva: 1 a cada 24 → 12 → 6 → 3 → todos (o scrub fica utilizável cedo)
    // (o último quadro entra junto com o primeiro passo: faz parte do "esqueleto")
    order() {
      const seen = new Set(), out = [];
      const add = i => { if (!seen.has(i)) { seen.add(i); out.push(i); } };
      [24, 12, 6, 3, 1].forEach((step, k) => {
        for (let i = 0; i < this.count; i += step) add(i);
        if (k === 0) add(this.count - 1);
      });
      return out;
    }

    // Fase 1 (gated): só o "esqueleto" (1 a cada 24) — é o que o preloader espera.
    // Fase 2 (release): o resto, depois da intro, sem disputar banda com o hero.
    start(concurrency = 6) {
      this.queue = this.order();
      this.concurrency = concurrency;
      this.active = 0;
      this.gated = true;
      this.pump();
    }
    release() { this.gated = false; this.pump(); }
    pump() {
      while (!this.failed && this.active < this.concurrency && this.queue.length) {
        if (this.gated && !this.coarse.has(this.queue[0])) break;
        this.active++;
        this.load(this.queue.shift());
      }
    }
    load(i) {
      const img = new Image();
      img.decoding = 'async';
      const finish = () => { this.active--; this.pump(); };
      img.onload = () => {
        const done = () => {
          this.frames[i] = img;
          this.loaded[i] = 1;
          this.loadedCount++;
          if (this.coarse.has(i)) {
            this.coarseLoaded++;
            this.emit('coarse', this.coarseLoaded / this.coarse.size);
          }
          this.emit('progress', this.loadedCount / this.count);
          if (i === this.wanted || this.current < 0) this.render(this.wanted, true);
          finish();
        };
        img.decode ? img.decode().then(done, done) : done();
      };
      img.onerror = () => {
        if (i === 0) { this.failed = true; this.emit('fail'); return; }
        finish();
      };
      img.src = this.src(i);
    }

    nearest(i) {
      if (this.loaded[i]) return i;
      for (let d = 1; d < this.count; d++) {
        if (i - d >= 0 && this.loaded[i - d]) return i - d;
        if (i + d < this.count && this.loaded[i + d]) return i + d;
      }
      return -1;
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      if (!w || !h) return;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.render(this.wanted, true);
    }

    // Geometria "cover" com ponto focal; em retrato vira faixa (62% da altura).
    // Compartilhada com o handoff da caneta do hero (seção 7).
    static layout(cw, ch, iw = 1920, ih = 1080) {
      const portrait = cw / ch < 0.8;
      const s = portrait ? Math.max(cw / iw, (ch * 0.62) / ih) : Math.max(cw / iw, ch / ih);
      const dw = iw * s, dh = ih * s;
      return { portrait, dw, dh, dx: (cw - dw) * 0.56, dy: (ch - dh) / 2 };   // foco levemente à direita
    }

    render(i, force = false) {
      this.wanted = i;
      const idx = this.nearest(i);
      if (idx < 0 || (idx === this.current && !force)) return;
      const img = this.frames[idx];
      const { ctx, canvas } = this;
      const cw = canvas.width, ch = canvas.height;
      const { portrait, dw, dh, dx, dy } = FrameSequence.layout(cw, ch, img.naturalWidth, img.naturalHeight);
      ctx.fillStyle = '#FDFDFD';
      if (portrait) ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, dx, dy, dw, dh);
      if (portrait) {
        const fade = dh * 0.12;
        let g = ctx.createLinearGradient(0, dy, 0, dy + fade);
        g.addColorStop(0, 'rgba(253,253,253,1)'); g.addColorStop(1, 'rgba(253,253,253,0)');
        ctx.fillStyle = g; ctx.fillRect(0, dy, cw, fade);
        g = ctx.createLinearGradient(0, dy + dh - fade, 0, dy + dh);
        g.addColorStop(0, 'rgba(253,253,253,0)'); g.addColorStop(1, 'rgba(253,253,253,1)');
        ctx.fillStyle = g; ctx.fillRect(0, dy + dh - fade, cw, fade);
      }
      this.current = idx;
    }
  }

  const FRAME_COUNT = 240;
  const scrubSection = $('.scrub');
  const saveData = navigator.connection && navigator.connection.saveData;
  const frameSet = MOBILE() || saveData ? 'sm' : 'lg';
  const seq = REDUCED ? null : new FrameSequence({
    canvas: $('.scrub__canvas'),
    count: FRAME_COUNT,
    src: i => `assets/frames/${frameSet}/frame_${String(i + 1).padStart(4, '0')}.webp`,
  });

  /* ------------------------------------------------------------------------
     5. PRELOADER — contador 0–100 + barra; sai com cortina (clip-path)
     ------------------------------------------------------------------------ */
  function runPreloader() {
    return new Promise(resolve => {
      const el = $('.preloader');
      const countEl = $('.js-load-count');
      const labelEl = $('.js-load-label');
      const bar = $('.preloader__bar i');
      const parts = { fonts: 0, pen: 0, frames: REDUCED ? 1 : 0 };
      const target = () => (parts.fonts * 0.15 + parts.pen * 0.2 + parts.frames * 0.65) * 100;
      const shown = { v: 0 };
      const t0 = performance.now();

      document.fonts.ready.then(() => { parts.fonts = 1; });
      const pen = $('.pen__img');
      const penDone = () => { parts.pen = 1; };
      if (pen.complete && pen.naturalWidth) penDone();
      else { pen.addEventListener('load', penDone, { once: true }); pen.addEventListener('error', penDone, { once: true }); }
      if (seq) {
        seq.on('coarse', p => {
          parts.frames = p;
          labelEl.textContent = `Frames ${String(seq.loadedCount).padStart(3, '0')}/${FRAME_COUNT}`;
        });
        seq.on('fail', () => { parts.frames = 1; });
      }
      // nunca segurar o usuário mais de 6 s
      const bail = setTimeout(() => { parts.fonts = parts.pen = parts.frames = 1; }, 6000);

      const tick = () => {
        const tgt = target();
        // aproxima suavemente, com velocidade mínima para não "travar" em 99
        shown.v = Math.min(tgt, shown.v + Math.max((tgt - shown.v) * 0.1, 1.2));
        countEl.textContent = Math.round(shown.v);
        bar.style.transform = `scaleX(${shown.v / 100})`;
        if (shown.v >= 99.9 && performance.now() - t0 > (REDUCED ? 0 : 1200)) {
          gsap.ticker.remove(tick);
          clearTimeout(bail);
          countEl.textContent = '100';
          labelEl.textContent = 'Pronto';
          if (REDUCED) {
            gsap.to(el, { autoAlpha: 0, duration: D.instant, onComplete: () => { el.remove(); resolve(); } });
          } else {
            const tl = gsap.timeline({ onComplete: () => { el.remove(); } });
            tl.to('.preloader__bottom, .preloader__brand', { y: -24, autoAlpha: 0, duration: 0.6, ease: 'power2.in' })
              .to(el, { clipPath: 'inset(0% 0% 100% 0%)', duration: D.cine, ease: EXPO }, '-=0.15')
              .add(resolve, '-=0.85');                   // o hero começa enquanto a cortina sobe
          }
        }
      };
      gsap.ticker.add(tick);
    });
  }

  /* ------------------------------------------------------------------------
     6. INTRO DO HERO — sequência coreografada
     ------------------------------------------------------------------------ */
  const hero = $('.hero');
  const header = $('.site-header');
  const title = $('.hero__title');
  const lines = $$('.hero__title .line__inner');
  const ink = $('.outline--ink');
  const caret = $('.nib-caret');
  const penEl = $('.pen');
  const penIntro = $('.pen__intro');
  const penFloat = $('.pen__float');
  const penTilt = $('.pen__tilt');
  const penImg = $('.pen__img');
  const penShadow = $('.pen__shadow');

  function heroIntro() {
    if (REDUCED) {
      gsap.set(header, { y: 0 });
      gsap.set(lines, { yPercent: 0, y: 0 });
      gsap.to(['.eyebrow', '.hero__lead', '.hero__ctas > *', '.pen', '.rail', '.hero__hint', '.hero__meta'], { autoAlpha: 1, duration: D.base, ease: 'none' });
      return gsap.timeline();
    }
    gsap.set(lines, { yPercent: 110, y: 0 });
    gsap.set(ink, { clipPath: 'inset(0% 100% 0% 0%)' });
    gsap.set(penEl, { autoAlpha: 1 });

    const tl = gsap.timeline({ defaults: { ease: EXPO } });
    tl.to(header, { y: 0, duration: D.slow }, 0)
      // eyebrow
      .fromTo('.eyebrow', { autoAlpha: 0, x: -16 }, { autoAlpha: 1, x: 0, duration: D.slow }, 0.15)
      .fromTo('.eyebrow__dot', { scale: 0 }, { scale: 1, duration: 0.7, ease: ELASTIC }, 0.25)
      // headline: linha a linha, máscara + stagger
      .to(lines, { yPercent: 0, duration: D.cine, stagger: D.stagger + 0.02 }, 0.3)
      // a linha em outline "desenha" o contorno, com o caret-pena acompanhando
      .add(drawOutline(), 0.95)
      // caneta entra deslizando na diagonal: rotação + blur → nitidez
      .fromTo(penIntro,
        { xPercent: 26, yPercent: -34, rotation: -16, scale: 0.92, autoAlpha: 0, filter: 'blur(18px)' },
        { xPercent: 0, yPercent: 0, rotation: 0, scale: 1, autoAlpha: 1, filter: 'blur(0px)', duration: D.cineLong + 0.3,
          onStart: () => penIntro.classList.add('will-transform'),
          onComplete: () => { penIntro.classList.remove('will-transform'); gsap.set(penIntro, { clearProps: 'filter' }); } },
        0.7)
      // a sombra "cresce" quando a caneta pousa no ar
      .fromTo(penShadow, { scaleX: 0.25, autoAlpha: 0 }, { scaleX: 1, autoAlpha: 1, duration: D.cine }, 1.35)
      // texto de apoio e CTAs sobem com stagger (DS animationIn: y 30 + blur 10 → 0)
      .fromTo('.hero__lead', { autoAlpha: 0, y: 30, filter: 'blur(10px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: D.slow, clearProps: 'filter' }, 1.25)
      .fromTo('.hero__ctas > *', { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: D.slow, stagger: D.stagger }, 1.4)
      .fromTo(['.rail', '.hero__hint', '.hero__meta'], { autoAlpha: 0 }, { autoAlpha: 1, duration: D.slow, stagger: D.stagger }, 1.6)
      .add(startFloat, 2.2)
      // a timeline de scroll só nasce depois que a intro assentou os valores finais
      .add(heroScroll, 2.4);
    return tl;
  }

  function drawOutline() {
    const p = { v: 0 };
    return gsap.timeline()
      .set(caret, { autoAlpha: 1, x: 0 })
      .to(p, {
        v: 1, duration: 1.6, ease: EXPO,
        onUpdate() {
          const w = ink.offsetWidth;
          ink.style.clipPath = `inset(0% ${(1 - p.v) * 100}% 0% 0%)`;
          caret.style.transform = `translate3d(${w * p.v}px,0,0)`;
        },
      })
      .to(caret, { autoAlpha: 0, duration: D.base }, '-=0.5');
  }

  /* ------------------------------------------------------------------------
     7. HERO — flutuação contínua, tilt 3D no mouse, parallax de scroll
     ------------------------------------------------------------------------ */
  let floatTweens = [];
  let penIdle = true;            // flutuação + tilt só enquanto a caneta está "em casa"
  let resetTilt = () => {};      // definido em heroInteractions (reusa os quickTo, sem conflito)
  function startFloat() {
    if (REDUCED) return;
    floatTweens = [
      gsap.to(penFloat, { y: -14, rotation: 1.4, duration: 3.5, ease: 'sine.inOut', yoyo: true, repeat: -1 }),
      gsap.to(penShadow, { scaleX: 0.84, opacity: 0.6, duration: 3.5, ease: 'sine.inOut', yoyo: true, repeat: -1 }),
    ];
  }
  function setPenIdle(idle) {
    if (idle === penIdle) return;
    penIdle = idle;
    if (idle) floatTweens.forEach(t => t.resume());
    else {
      floatTweens.forEach(t => t.pause());
      gsap.to(penFloat, { y: 0, rotation: 0, duration: D.base });       // assenta para o handoff
      resetTilt();
    }
  }

  function heroInteractions() {
    if (REDUCED) return;
    // Tilt 3D discreto (perspective no .hero__stage)
    if (FINE) {
      const rx = gsap.quickTo(penTilt, 'rotationX', { duration: 0.9, ease: 'power3' });
      const ry = gsap.quickTo(penTilt, 'rotationY', { duration: 0.9, ease: 'power3' });
      const tx = gsap.quickTo(penTilt, 'x', { duration: 1.1, ease: 'power3' });
      const ty = gsap.quickTo(penTilt, 'y', { duration: 1.1, ease: 'power3' });
      const hx = gsap.quickTo(title, 'x', { duration: 1.2, ease: 'power3' });
      resetTilt = () => { ry(0); rx(0); tx(0); ty(0); hx(0); };
      hero.addEventListener('pointermove', e => {
        if (!penIdle) return;
        const nx = e.clientX / innerWidth - 0.5, ny = e.clientY / innerHeight - 0.5;
        ry(nx * 14); rx(-ny * 10); tx(nx * 26); ty(ny * 18); hx(nx * -10);
      });
      hero.addEventListener('pointerleave', () => { ry(0); rx(0); tx(0); ty(0); hx(0); });
    }
  }

  /* Posição da caneta (≥1024px), em unidades fluidas da grade e do título:
     - centro mira 64% da viewport (PEN_TARGET);
     - a ponta traseira termina antes da linha direita da grade (padding do header) e do trilho,
       com respiro clamp(1rem, 2vw, 3rem);
     - o eixo cruza "mais tecnológica" logo DEPOIS da última letra: o corpo inclinado passa
       por trás só do fim da palavra (≈ "ica"), e o resto continua legível;
     - a altura sai desse cruzamento (inclinação fixa), e a ponta superior nunca invade o header.
     Escala e inclinação são as de antes (largura = 5.6 × corpo do título). */
  const PEN_AXIS = (25.2 + 9) * Math.PI / 180;   // eixo do recorte (25.2°, medido por PCA) + rotação CSS (9°)
  const PEN_TARGET = 0.64;
  function offsetIn(el, ancestor) {               // posição de layout (ignora transforms)
    let x = 0, y = 0;
    for (let n = el; n && n !== ancestor; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
    return { x, y };
  }
  function placePen() {
    if (innerWidth < 1024) { ['width', 'left', 'top', 'right', 'margin-top'].forEach(p => penEl.style.removeProperty(p)); return; }
    const ghost = $('.outline--ghost');
    const inner = ghost.parentElement;
    const node = ghost.firstChild;
    const r = document.createRange();
    r.setStart(node, node.data.length - 1); r.setEnd(node, node.data.length);
    const aR = r.getBoundingClientRect();                     // última letra ("a")
    const ir = inner.getBoundingClientRect();
    const T = parseFloat(getComputedStyle(title).fontSize);
    const base = offsetIn(inner, hero);
    const vw = document.documentElement.clientWidth;
    const ux = Math.cos(PEN_AXIS), uy = Math.sin(PEN_AXIS), tan = uy / ux;

    // cruzamento: logo após o fim da palavra, na metade da altura-x (Inter: ascent .969, x-height .546)
    const qx = base.x + (aR.right - ir.left) + 0.15 * T;
    const qy = base.y + (aR.top - ir.top) + 0.969 * T - 0.27 * T;

    const W = Math.min(5.6 * T, vw * 0.5);                    // mesma escala de antes
    const L = W * 1.08;                                       // comprimento do eixo
    const H = W * 783 / 1446;
    const thick = 0.05 * W;                                   // meia-espessura visual (corpo + clipe)
    const reachX = (L / 2) * ux + thick, reachY = (L / 2) * uy + thick;

    // limites horizontais: borda direita do conteúdo do header e trilho, menos o respiro
    const gridRight = vw - parseFloat(getComputedStyle($('.site-header')).paddingRight);
    const breathe = Math.min(Math.max(16, vw * 0.02), 48);
    const limit = Math.min(gridRight, $('.rail').getBoundingClientRect().left) - breathe;

    let cx = vw * PEN_TARGET;
    cx = Math.min(cx, qx - 0.35 * T + (L / 2) * ux);          // a tampa ainda cruza o fim da palavra
    const stageTop = $('.hero__stage').offsetTop;
    const minTop = stageTop + 0.04 * innerHeight;             // ponta superior abaixo do header
    const cxForTop = qx + (minTop + reachY - qy) / tan;
    cx = Math.max(cx, cxForTop);
    cx = Math.min(cx, limit - reachX);                        // a cauda termina antes da grade/trilho
    const cy = qy + (cx - qx) * tan;                          // o eixo passa por (qx, qy)

    Object.assign(penEl.style, {
      width: `${W}px`, left: `${cx - W / 2}px`, top: `${cy - H / 2 - stageTop}px`, right: 'auto', marginTop: '0px',
    });
  }

  /* Handoff: onde a caneta do quadro 0 do filme aparece na tela.
     Medidas do recorte (scripts/cutout_pen.py) no quadro 1920×1080:
     bbox 238→1684 × 112→895 ⇒ centro normalizado (0.5005, 0.4662), largura 1446px. */
  const FRAME0_PEN = { cx: 961 / 1920, cy: 503.5 / 1080, w: 1446 / 1920 };
  const PEN_ROT = 9;    // rotação extra aplicada ao recorte no CSS (.pen__img)

  function penHandoffGeometry() {
    const canvas = $('.scrub__canvas');
    // Mede a caixa de LAYOUT (sem o transform do GSAP): o y final do tween é absoluto.
    const saved = penEl.style.transform;
    penEl.style.transform = 'none';
    const r = penEl.getBoundingClientRect();
    penEl.style.transform = saved;
    const pageX = r.left + r.width / 2;
    const pageY = r.top + r.height / 2 + scrollY;
    const cw = canvas.clientWidth || innerWidth, ch = canvas.clientHeight || innerHeight;
    const L = FrameSequence.layout(cw, ch);
    const vx = L.dx + FRAME0_PEN.cx * L.dw;
    const vy = L.dy + FRAME0_PEN.cy * L.dh;
    const scrubTop = scrubSection.getBoundingClientRect().top + scrollY;
    return {
      x: vx - pageX,
      y: scrubTop + vy - pageY,                        // posição na página: "pousa" sobre o quadro 0
      scale: (FRAME0_PEN.w * L.dw) / r.width,
    };
  }

  // Scroll: headline com parallax suave; a caneta gira, escala e "mergulha" no filme
  function heroScroll() {
    if (REDUCED) return;
    let geo = penHandoffGeometry();
    const canvas = $('.scrub__canvas');
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: hero, start: 'top top', end: 'bottom top', scrub: true, invalidateOnRefresh: true,
        onRefreshInit: () => { geo = penHandoffGeometry(); },
        onUpdate: self => setPenIdle(self.progress < 0.08),
      },
      defaults: { ease: 'none' },
    });
    // texto: parallax mais lento que a caneta; tudo sai junto, sem colisão
    tl.to(['.eyebrow', '.hero__lead', '.hero__ctas'], { y: -40, autoAlpha: 0, duration: 0.3 }, 0)
      .to(title, { yPercent: -18, autoAlpha: 0, duration: 0.6 }, 0)
      .to(['.hero__hint', '.hero__meta'], { autoAlpha: 0, duration: 0.15 }, 0)
      // caneta: desce, cresce e gira até coincidir com a do quadro 0 (ângulo idêntico)
      .to(penEl, {
        x: () => geo.x, y: () => geo.y, scale: () => geo.scale, rotation: -PEN_ROT,
        duration: 0.75, ease: 'power2.inOut',
      }, 0)
      .to(penShadow, { autoAlpha: 0, duration: 0.3 }, 0.1)
      // crossfade: o filme acende por baixo, já alinhado; a caneta do hero se dissolve nele
      .fromTo(canvas, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.1 }, 0.74)
      .to(penEl, { autoAlpha: 0, duration: 0.12 }, 0.86)
      .set({}, {}, 1);
  }

  /* ------------------------------------------------------------------------
     8. FILME — pin + scrub. Progresso do vídeo 100% atrelado ao scroll
     ------------------------------------------------------------------------ */
  function initScrub() {
    if (REDUCED || !seq) return;
    const sticky = $('.scrub__sticky');
    const frame = $('.scrub__frame');
    const canvas = $('.scrub__canvas');
    const video = $('.scrub__video');
    const frameLabel = $('.js-frame');
    const barEl = $('.scrub__bar i');
    const loadEl = $('.js-scrub-loading');
    const steps = $$('.step');
    let useVideo = false;
    let target = 0, current = 0, lastIdx = -1;

    seq.on('progress', p => {
      loadEl.textContent = `Buffer ${Math.round(p * 100)}%`;
      if (p >= 1) loadEl.classList.add('is-done');
    });
    seq.on('fail', () => {
      // Opção B: <video> reencodado com keyframe em todos os quadros (-g 1)
      useVideo = true;
      canvas.hidden = true;
      video.hidden = false;
      video.src = 'assets/video/video_scrub.mp4';
      video.preload = 'auto';
      video.load();
      video.play().then(() => video.pause()).catch(() => {}); // destrava o seek no iOS
      loadEl.textContent = 'Vídeo';
    });

    seq.resize();
    let rT;
    window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => seq.resize(), 120); });

    const scrubLength = () => innerHeight * (MOBILE() ? 3.2 : 4);
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: sticky,
        start: 'top top',
        end: () => '+=' + scrubLength(),
        pin: true,
        scrub: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: self => { target = self.progress * (FRAME_COUNT - 1); },
      },
    });

    // abertura: o quadro sai de um "cartão" (raio 14px do DS) para tela cheia
    tl.fromTo(frame,
      { clipPath: 'inset(7% 5% 7% 5% round 14px)' },
      { clipPath: 'inset(0% 0% 0% 0% round 0px)', duration: 0.1, ease: EXPO }, 0);

    // blocos de texto: fade + blur + translateY em janelas de progresso
    steps.forEach(step => {
      const tin = parseFloat(step.dataset.in), tout = parseFloat(step.dataset.out);
      tl.fromTo(step,
        { autoAlpha: 0, y: 48, filter: 'blur(10px)' },
        { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.06, ease: EXPO }, tin);
      if (tout <= 1) {
        tl.to(step, { autoAlpha: 0, y: -48, filter: 'blur(10px)', duration: 0.05, ease: 'power2.in' }, tout - 0.05);
      }
    });
    tl.set({}, {}, 1); // garante que a timeline dure exatamente 1 (= progresso)

    // Interpolação (lerp) independente de fps → sem saltos entre quadros
    gsap.ticker.add((time, dt) => {
      const k = 1 - Math.pow(1 - 0.18, dt / 16.667);
      current += (target - current) * k;
      if (Math.abs(target - current) < 0.02) current = target;
      if (useVideo) {
        const dur = video.duration || 10;
        const t = (current / (FRAME_COUNT - 1)) * dur;
        if (video.readyState >= 1 && Math.abs(video.currentTime - t) > 1 / 60) video.currentTime = t;
      } else {
        const idx = Math.round(current);
        if (idx !== lastIdx) {
          seq.render(idx);
          lastIdx = idx;
          frameLabel.textContent = String(idx + 1).padStart(3, '0');
          barEl.style.transform = `scaleX(${idx / (FRAME_COUNT - 1)})`;
        }
      }
    });
  }

  /* ------------------------------------------------------------------------
     9. REVEALS — títulos (SplitText linhas com máscara), blocos, mídia, números
     ------------------------------------------------------------------------ */
  function initReveals() {
    // 9.1 Títulos de seção: linhas com máscara (translateY 110% → 0, 1.2s, stagger)
    $$('[data-split]').forEach(el => {
      if (REDUCED || !window.SplitText) {
        gsap.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: D.base, scrollTrigger: { trigger: el, start: 'top 88%' } });
        return;
      }
      SplitText.create(el, {
        type: 'lines', mask: 'lines', linesClass: 'split-line', autoSplit: true,
        onSplit: self => gsap.from(self.lines, {
          yPercent: 110, duration: D.cine, stagger: D.stagger, ease: EXPO,
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        }),
      });
    });

    // 9.2 Blocos genéricos (DS .reveal: y 2rem → 0, 1s expo), em lote com stagger
    ScrollTrigger.batch('[data-reveal]', {
      start: 'top 88%',
      once: true,
      onEnter: batch => gsap.fromTo(batch,
        REDUCED ? { autoAlpha: 0 } : { autoAlpha: 0, y: 32 },
        { autoAlpha: 1, y: 0, duration: REDUCED ? D.instant : D.slow, stagger: D.stagger, ease: EXPO }),
    });

    // 9.3 Mídia: clip-path reveal + parallax interno
    $$('[data-clip]').forEach(fig => {
      const img = $('img', fig);
      // erro antes do JS (inline onerror já cobre) ou depois: marca o placeholder
      if (img.complete && !img.naturalWidth) fig.classList.add('is-broken');
      img.addEventListener('error', () => fig.classList.add('is-broken'), { once: true });
      if (REDUCED) return;
      // em cache (img.complete) segue direto; senão recalcula os gatilhos quando a imagem chegar,
      // para o reveal nunca ficar preso em inset(100%) por posição calculada antes do load
      if (!img.complete) img.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
      const tl = gsap.timeline({ scrollTrigger: { trigger: fig, start: 'top 85%', once: true } })
        .fromTo(fig, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: D.cineLong, ease: EXPO });
      // Fig. 03 (estúdio): em vez do zoom de entrada + parallax, zoom lento atrelado ao scroll,
      // abrindo do close no logo/clipe para a caneta mais inteira enquanto o bloco atravessa a tela
      if (fig.hasAttribute('data-zoom')) {
        gsap.fromTo(img, { scale: 1.25 }, {
          scale: 1.1, ease: 'none',
          scrollTrigger: { trigger: fig, start: 'top bottom', end: 'bottom top', scrub: true },
        });
        return;
      }
      tl.fromTo(img, { scale: 1.25 }, { scale: 1, duration: D.cineLong + 0.3, ease: EXPO }, 0);
      gsap.fromTo(img, { yPercent: -6 }, {
        yPercent: 6, ease: 'none',
        scrollTrigger: { trigger: fig, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    // 9.4 Números outline do cabeçalho (DS: parallax data-speed .08)
    if (!REDUCED) $$('[data-drift]').forEach(n => {
      gsap.fromTo(n, { yPercent: 30 }, { yPercent: -30, ease: 'none', scrollTrigger: { trigger: n.closest('.sec-head'), start: 'top bottom', end: 'bottom top', scrub: true } });
    });

    // 9.5 Contadores (DS countUp: 1.6s, ease quart-out)
    $$('[data-count]').forEach(el => {
      const end = parseFloat(el.dataset.count);
      const dec = parseInt(el.dataset.decimals || '0', 10);
      if (REDUCED) return;
      const o = { v: 0 };
      el.textContent = (0).toFixed(dec);
      gsap.to(o, {
        v: end, duration: 1.6, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        onUpdate: () => { el.textContent = o.v.toFixed(dec); },
      });
    });

    // 9.6 Data-viz (DS v4: grow-bar, draw-path, gauge)
    $$('[data-viz]').forEach(svg => {
      const bars = $$('.viz-bar', svg), paths = $$('.viz-line', svg), dots = $$('.viz-dot', svg), gauges = $$('.viz-gauge', svg);
      if (REDUCED) {
        gauges.forEach(g => gsap.set(g, { strokeDasharray: `${g.dataset.val} 100` }));
        return;
      }
      if (paths.length) gsap.set(paths, { strokeDasharray: 1, strokeDashoffset: 1 });
      if (gauges.length) gsap.set(gauges, { strokeDasharray: '0 100' });
      if (dots.length) gsap.set(dots, { scale: 0, transformOrigin: 'center' });
      const tl = gsap.timeline({ scrollTrigger: { trigger: svg, start: 'top 90%', once: true } });
      if (bars.length) tl.from(bars, { scaleY: 0, duration: D.slow, stagger: D.stagger, ease: EXPO }, 0.1);
      if (paths.length) tl.to(paths, { strokeDashoffset: 0, duration: 1.4, ease: EXPO }, 0.1);
      if (dots.length) tl.to(dots, { scale: 1, duration: D.base, ease: ELASTIC }, 0.9);
      gauges.forEach(g => tl.to(g, { strokeDasharray: `${g.dataset.val} 100`, duration: 2.2, ease: EXPO }, 0.2));
    });

    // 9.7 Assinatura do footer: letras sobem da máscara
    if (!REDUCED) gsap.from('.footer__word span', {
      yPercent: 100, duration: D.cine, stagger: 0.06, ease: EXPO,
      scrollTrigger: { trigger: '.footer__word', start: 'top 95%', once: true },
    });

    // 9.8 Flashlight (DS): luz que segue o cursor dentro de cards
    if (FINE) $$('.flashlight').forEach(c => c.addEventListener('pointermove', e => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`);
      c.style.setProperty('--my', `${e.clientY - r.top}px`);
    }));
  }

  /* ------------------------------------------------------------------------
     9b. PRODUTO — anatomia: pin + scrub (desktop), reveal (mobile), realce cruzado
     ------------------------------------------------------------------------ */
  function initAnatomy() {
    const anat = $('[data-anat]');
    const specs = $('[data-specs]');
    if (!anat || !specs) return;

    // Realce cruzado: callout (ponto, linha, rótulo, lupa) ↔ card de especificação
    const parts = [...$$('[data-part]', anat), ...$$('[data-part]', specs)];
    let active = null;
    const setActive = n => {
      if (n === active) return;
      active = n;
      anat.classList.toggle('has-active', !!n);
      specs.classList.toggle('has-active', !!n);
      parts.forEach(el => el.classList.toggle('is-active', !!n && el.dataset.part === n));
    };
    [anat, specs].forEach(host => {
      host.addEventListener('pointerover', e => {
        const t = e.target.closest('[data-part]');
        setActive(t && host.contains(t) ? t.dataset.part : null);
      });
      host.addEventListener('pointerleave', () => setActive(null));
    });

    // Régua de 140 mm: linhas de extensão nas extremidades EXATAS da caneta (medidas no
    // layout, sem transforms) e cota no nível 616/680 da prancha. Fig. 01 alinhada à mesma borda.
    const plate = $('.anat__plate', anat);
    const ruler = $('.anat__ruler', anat);
    const fig = $('.anat__fig', anat);
    const penBox = $('.anat__pen', anat);
    const penImg = $('img', penBox);
    const PEN_PAD = 6 / 1574;                    // margem transparente do recorte (pen_horizontal.py)
    const RULER_Y = 616 / 680;                   // linha da cota, em fração da altura da prancha
    function sizeRuler() {
      if (innerWidth < 1024 || !penImg.offsetWidth) return;
      const w = penImg.offsetWidth;
      const left = penBox.offsetLeft + w * PEN_PAD;
      const top = penBox.offsetTop + penBox.offsetHeight;
      Object.assign(ruler.style, {
        left: `${left}px`, width: `${w * (1 - 2 * PEN_PAD)}px`,
        top: `${top}px`, height: `${plate.offsetHeight * RULER_Y - top}px`,
      });
      fig.style.left = `${left}px`;
    }
    sizeRuler();
    if (!penImg.complete) penImg.addEventListener('load', () => { sizeRuler(); ScrollTrigger.refresh(); }, { once: true });
    ScrollTrigger.addEventListener('refreshInit', sizeRuler);

    if (REDUCED) return;            // composição final estática, tudo visível
    const q = s => $$(s, anat);
    const part = n => ({
      dot: q(`.anat__dot[data-part="${n}"]`),
      lines: q(`.anat__line[data-part="${n}"]`),
      idx: q(`.note[data-part="${n}"] .note__idx`),
      text: q(`.note[data-part="${n}"] .note__text`),
    });
    const mm = gsap.matchMedia();

    // Desktop: palco pinado ~170vh. 1) caneta entra na diagonal do hero e assenta;
    // 2) callouts em sequência (ponto pulsa → linha desenha → rótulo sobe da máscara);
    // 3) a lupa abre com clip-path circular e zoom interno.
    mm.add('(min-width: 1024px)', () => {
      const pen = $('.anat__pen', anat);
      // palco compacto: pina centralizado na área útil abaixo do header (sem faixa morta)
      const pinStart = () => {
        const h = headerH(), free = innerHeight - h;
        return anat.offsetHeight < free ? `center ${h + free / 2}px` : `top ${h}px`;
      };
      const pin = ScrollTrigger.create({ trigger: anat, start: pinStart, end: '+=170%', pin: true, anticipatePin: 1, invalidateOnRefresh: true });
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: anat, start: 'top 55%', end: () => pin.end, scrub: true, invalidateOnRefresh: true },
      });
      gsap.set(q('.anat__line'), { strokeDasharray: 1, strokeDashoffset: 1 });

      tl.fromTo(pen,
        { rotation: 34, xPercent: -14, yPercent: -230, autoAlpha: 0 },     // 34° = inclinação da caneta no hero
        { rotation: 0, xPercent: 0, yPercent: 0, autoAlpha: 1, duration: 0.3, ease: EXPO }, 0)
        .fromTo('.anat__shadow', { scaleX: 0.2, autoAlpha: 0 }, { scaleX: 1, autoAlpha: 1, duration: 0.14, ease: EXPO }, 0.18)
        .fromTo(q('.anat__axis, .anat__ruler-ext'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.08 }, 0.24);

      const callout = (n, t) => {
        const p = part(n);
        tl.fromTo(p.dot, { scale: 0 }, { scale: 1.9, duration: 0.025, ease: 'power2.out' }, t)
          .to(p.dot, { scale: 1, duration: 0.035, ease: ELASTIC }, t + 0.025)
          .fromTo(p.idx, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.03 }, t + 0.05)
          .fromTo(p.text, { yPercent: 110 }, { yPercent: 0, duration: 0.045, ease: EXPO }, t + 0.055);
        // linha do callout (SVG); a /05 é a cota da régua, que abre do centro para as pontas
        if (p.lines.length) tl.to(p.lines, { strokeDashoffset: 0, duration: 0.05, ease: 'power2.out' }, t + 0.02);
        if (n === 5) tl.fromTo('.anat__ruler-line', { scaleX: 0 }, { scaleX: 1, duration: 0.06, ease: EXPO }, t + 0.02);
      };
      [2, 3, 4, 6, 5].forEach((n, i) => callout(n, 0.3 + i * 0.07));

      // /01 por último: a ponta, com a lupa
      callout(1, 0.68);
      tl.fromTo('.anat__ring', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.04 }, 0.72)
        .fromTo('.anat__lens', { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(50% at 50% 50%)', duration: 0.12, ease: EXPO }, 0.73)
        .fromTo('.anat__lens img', { scale: 1.35 }, { scale: 1, duration: 0.17, ease: EXPO }, 0.73)
        .set({}, {}, 1);
    });

    // Mobile/tablet: sem pin — revela caneta, pontos, lista e lupa ao entrar
    mm.add('(max-width: 1023px)', () => {
      const st = { trigger: '.anat__plate', start: 'top 80%', once: true };
      gsap.timeline({ scrollTrigger: st, defaults: { ease: EXPO } })
        .fromTo('.anat__pen', { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: D.slow })
        .fromTo(q('.anat__dot'), { scale: 0 }, { scale: 1, duration: D.base, stagger: 0.06, ease: ELASTIC }, 0.4);
      gsap.fromTo(q('.note'), { autoAlpha: 0, y: 16 }, {
        autoAlpha: 1, y: 0, duration: D.slow, stagger: D.stagger, ease: EXPO,
        scrollTrigger: { trigger: '.anat__notes', start: 'top 85%', once: true },
      });
      gsap.fromTo('.anat__lens', { clipPath: 'circle(0% at 50% 50%)' }, {
        clipPath: 'circle(50% at 50% 50%)', duration: D.cineLong, ease: EXPO,
        scrollTrigger: { trigger: '.anat__loupe', start: 'top 85%', once: true },
      });
    });
  }

  /* ------------------------------------------------------------------------
     9c. MARQUEE — loop contínuo (direita → esquerda), sem buraco em nenhuma largura
     ------------------------------------------------------------------------ */
  function initMarquee() {
    const track = $('.marquee__track');
    if (!track) return;
    const source = $('.marquee__group', track);
    const SECONDS_PER_GROUP = 40;   // mesma velocidade de antes (40s por grupo)
    let tween = null, lastW = 0;

    function build() {
      const progress = tween ? tween.progress() : 0;
      if (tween) tween.kill();
      // descarta grupos extras (do HTML ou de builds anteriores) — nunca acumula clones
      $$('.marquee__group', track).forEach(g => { if (g !== source) g.remove(); });
      const groupW = source.getBoundingClientRect().width;
      if (!groupW) return;
      // largura total ≥ 2× a viewport + 1 grupo de folga
      const count = Math.ceil((innerWidth * 2) / groupW) + 1;
      for (let i = 1; i < count; i++) {
        const clone = source.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);
      }
      gsap.set(track, { x: 0 });
      if (REDUCED) return;            // parada, mas preenchendo a largura toda
      // 0 → −1 grupo: ao repetir, o grupo seguinte está exatamente onde o primeiro estava
      tween = gsap.fromTo(track, { x: 0 }, {
        x: -groupW, duration: SECONDS_PER_GROUP, ease: 'none', repeat: -1,
      });
      tween.progress(progress);       // resize não "pula" o loop
    }

    document.fonts.ready.then(() => { lastW = innerWidth; build(); });
    let t;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => { if (innerWidth !== lastW) { lastW = innerWidth; build(); } }, 150);
    });
  }

  /* ------------------------------------------------------------------------
     9d. DIVISORES DE FLUXO — onda com comprimento fixo (sem esticar) + sweep
     ------------------------------------------------------------------------ */
  function initFlowDividers() {
    const dividers = $$('.flow-divider');
    if (!dividers.length) return;
    // Valores medidos no layout anterior em ~1440px: período 600u × 1.0125 = 607.5px,
    // velocidade 600px / 12s = 50px/s, meia-onda com controles no meio (y 6 ↑ / 66 ↓), eixo y 36.
    const L = 607.5, H = 72, MID = 36, UP = 6, DOWN = 66, SPEED = 50;
    const SWEEP_DUR = 6;                       // mesma cadência do sweep anterior (6s, ease-out-expo)
    const wavePath = width => {
      const half = L / 2;
      let d = `M0 ${MID}`;
      for (let x = 0, up = true; x < width; x += half, up = !up) {
        const m = x + half / 2, y = up ? UP : DOWN;
        d += ` C${m} ${y} ${m} ${y} ${x + half} ${MID}`;
      }
      return d;
    };
    const state = new Map();
    let lastW = 0;

    // Tracejado da .wave-a: o ciclo (6 traço + 10 vão = 16px) precisa caber um número inteiro
    // de vezes no comprimento de arco de UMA onda; senão o padrão "pula" quando o loop recomeça.
    const probeSvg = $('.flow-divider svg.waves');
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    probe.setAttribute('d', wavePath(L));                    // exatamente um período
    probeSvg.appendChild(probe);
    const arc = probe.getTotalLength();
    probe.remove();
    const DASH = arc / Math.max(1, Math.round(arc / 16));    // ≈ 16px, divisor exato do período
    const MARCH_DUR = 1.6 * DASH / 16;                       // mesma velocidade da marcha anterior (16px / 1.6s)

    function build(div) {
      const prev = state.get(div) || {};
      const waveP = prev.wave ? prev.wave.progress() : 0;
      const sweepP = prev.sweep ? prev.sweep.progress() : 0;
      if (prev.wave) prev.wave.kill();
      if (prev.sweep) prev.sweep.kill();
      if (prev.march) prev.march.kill();

      const svg = $('svg.waves', div), group = $('.waves__g', svg), sweep = $('.sweep', div);
      const W = div.clientWidth;
      const total = Math.ceil((W + 2 * L) / L) * L;          // largura + 2 ondas de folga, múltiplo de L
      svg.setAttribute('viewBox', `0 0 ${total} ${H}`);
      svg.setAttribute('width', total);
      svg.setAttribute('height', H);
      svg.style.width = `${total}px`;
      const d = wavePath(total);
      $$('path', group).forEach(p => p.setAttribute('d', d)); // .wave-a mantém translate(0 6)
      const dashed = $('.wave-a', group);
      dashed.style.strokeDasharray = `${(DASH * 6) / 16} ${(DASH * 10) / 16}`;
      gsap.set(group, { x: 0 });

      if (REDUCED) {                                          // parada, preenchendo a largura; sem sweep
        gsap.set(sweep, { autoAlpha: 0 });
        state.set(div, {});
        return;
      }
      // x: 0 → −1 onda: ao repetir, o desenho é idêntico (padrão periódico em L)
      const wave = gsap.fromTo(group, { x: 0 }, { x: -L, duration: L / SPEED, ease: 'none', repeat: -1 });
      // sweep: entra fora da tela à direita, sai fora da tela à esquerda
      const sweepTween = gsap.fromTo(sweep, { x: W }, { x: -sweep.offsetWidth, duration: SWEEP_DUR, ease: EXPO, repeat: -1 });
      // marcha do tracejado (antes em CSS): mesmo sentido e velocidade, ciclo casado com o período
      const march = gsap.fromTo(dashed, { strokeDashoffset: 0 }, { strokeDashoffset: -DASH, duration: MARCH_DUR, ease: 'none', repeat: -1 });
      wave.progress(waveP);
      sweepTween.progress(sweepP);
      state.set(div, { wave, sweep: sweepTween, march });
    }

    lastW = innerWidth;
    dividers.forEach(build);
    let t;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => { if (innerWidth !== lastW) { lastW = innerWidth; dividers.forEach(build); } }, 150);
    });
  }

  /* ------------------------------------------------------------------------
     10. TRILHO — progresso, PREV e contador odômetro
     ------------------------------------------------------------------------ */
  function initRail() {
    const sections = $$('[data-section]');
    const total = sections.length;
    const prev = $('.rail__prev');
    const fill = $('.rail__fill');
    const progress = $('.header__progress');
    const status = $('.js-section-status');
    const odo = $('.odo');
    const navLinks = $$('[data-nav]');
    $('.rail__total').textContent = '/' + String(total).padStart(2, '0');

    // Monta as colunas 0–9
    odo.textContent = '';
    const strips = [0, 1].map(() => {
      const col = document.createElement('span'); col.className = 'odo__col';
      const strip = document.createElement('span'); strip.className = 'odo__strip';
      for (let d = 0; d < 10; d++) { const s = document.createElement('span'); s.textContent = d; strip.appendChild(s); }
      col.appendChild(strip); odo.appendChild(col);
      return strip;
    });

    let current = -1;
    function set(i) {
      if (i === current) return;
      current = i;
      const n = String(i + 1).padStart(2, '0');
      strips[0].style.setProperty('--d', n[0]);
      strips[1].style.setProperty('--d', n[1]);
      prev.setAttribute('aria-disabled', String(i === 0));
      status.textContent = `Seção ${n} de ${String(total).padStart(2, '0')}: ${sections[i].dataset.section}`;
      const id = sections[i].id;
      navLinks.forEach(a => a.classList.toggle('is-active', a.dataset.nav === id));
    }
    set(0);

    sections.forEach((sec, i) => ScrollTrigger.create({
      trigger: sec, start: 'top 55%', end: 'bottom 55%',
      onToggle: self => { if (self.isActive) set(i); },
    }));

    prev.addEventListener('click', () => { if (current > 0) scrollToTarget(sections[current - 1]); });

    const vertical = () => !MOBILE();
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: self => {
        const p = self.progress;
        progress.style.transform = `scaleX(${p})`;
        fill.style.transform = vertical() ? `scaleY(${p})` : `scaleX(${p})`;
      },
    });
  }

  /* ------------------------------------------------------------------------
     11. CURSOR — ponto + anel com inércia; rótulos contextuais
     ------------------------------------------------------------------------ */
  function initCursor() {
    if (!FINE || REDUCED) return;
    root.classList.add('has-cursor');
    const cur = $('.cursor');
    const dot = $('.cursor__dot'), ring = $('.cursor__ring'), label = $('.cursor__label');
    const dx = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power3' });
    const dy = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power3' });
    const rx = gsap.quickTo(ring, 'x', { duration: 0.55, ease: 'power3' });
    const ry = gsap.quickTo(ring, 'y', { duration: 0.55, ease: 'power3' });
    gsap.set([dot, ring], { x: innerWidth / 2, y: innerHeight / 2 });
    cur.classList.add('is-hidden');

    window.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      cur.classList.remove('is-hidden');
      dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
    }, { passive: true });
    document.addEventListener('pointerleave', () => cur.classList.add('is-hidden'));
    window.addEventListener('pointerdown', () => cur.classList.add('is-down'));
    window.addEventListener('pointerup', () => cur.classList.remove('is-down'));

    document.addEventListener('pointerover', e => {
      const labelled = e.target.closest('[data-cursor]');
      const link = e.target.closest('a, button, [role="button"], label');
      if (labelled) {
        label.textContent = labelled.dataset.cursor;
        cur.classList.add('is-label'); cur.classList.remove('is-link');
      } else if (link) {
        cur.classList.add('is-link'); cur.classList.remove('is-label');
      } else {
        cur.classList.remove('is-link', 'is-label');
      }
    });
  }

  /* ------------------------------------------------------------------------
     12. BOTÕES — magnético (DS: .22x / .3y, .5s expo) + preenchimento do ponto de entrada
     ------------------------------------------------------------------------ */
  function initButtons() {
    $$('.btn').forEach(btn => {
      const setOrigin = e => {
        const host = btn.querySelector('.beam__core') || btn;
        const r = host.getBoundingClientRect();
        host.style.setProperty('--x', `${e.clientX - r.left}px`);
        host.style.setProperty('--y', `${e.clientY - r.top}px`);
      };
      btn.addEventListener('pointerenter', e => { setOrigin(e); btn.classList.add('is-hover'); });
      btn.addEventListener('pointerleave', e => { setOrigin(e); btn.classList.remove('is-hover'); });
    });

    if (!FINE || REDUCED) return;
    $$('[data-magnetic]').forEach(el => {
      const xTo = gsap.quickTo(el, 'x', { duration: D.base, ease: EXPO });
      const yTo = gsap.quickTo(el, 'y', { duration: D.base, ease: EXPO });
      const lbl = $('.btn__label', el);
      const lx = lbl && gsap.quickTo(lbl, 'x', { duration: D.base, ease: EXPO });
      const ly = lbl && gsap.quickTo(lbl, 'y', { duration: D.base, ease: EXPO });
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - (r.left + r.width / 2), my = e.clientY - (r.top + r.height / 2);
        xTo(mx * 0.22); yTo(my * 0.3);
        if (lbl) { lx(mx * 0.08); ly(my * 0.1); }
      });
      el.addEventListener('pointerleave', () => { xTo(0); yTo(0); if (lbl) { lx(0); ly(0); } });
    });
  }

  /* ------------------------------------------------------------------------
     13. BENEFÍCIOS — trilho horizontal com arrastar + inércia
     ------------------------------------------------------------------------ */
  function initBenefits() {
    const rail = $('.benefits__rail');
    const bar = $('.benefits__progress i');
    if (!rail) return;
    const update = () => {
      const max = rail.scrollWidth - rail.clientWidth;
      const visible = rail.clientWidth / rail.scrollWidth;
      const p = max > 0 ? rail.scrollLeft / max : 1;
      bar.style.transform = `scaleX(${visible + (1 - visible) * p})`;
    };
    rail.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();

    let down = false, moved = false, startX = 0, startLeft = 0, lastX = 0, vx = 0;
    rail.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; moved = false;
      startX = lastX = e.clientX; startLeft = rail.scrollLeft; vx = 0;
      gsap.killTweensOf(rail);
    });
    window.addEventListener('pointermove', e => {
      if (!down) return;
      const d = e.clientX - startX;
      if (!moved && Math.abs(d) > 4) { moved = true; rail.classList.add('is-dragging'); }
      vx = e.clientX - lastX; lastX = e.clientX;
      rail.scrollLeft = startLeft - d;
    });
    window.addEventListener('pointerup', () => {
      if (!down) return;
      down = false;
      rail.classList.remove('is-dragging');
      if (moved && !REDUCED) gsap.to(rail, { scrollLeft: rail.scrollLeft - vx * 14, duration: D.slow, ease: EXPO });
    });
    rail.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);

    const step = () => (rail.querySelector('.card')?.offsetWidth || 320) + 1;
    $$('[data-rail]').forEach(b => b.addEventListener('click', () => {
      const to = rail.scrollLeft + parseInt(b.dataset.rail, 10) * step();
      if (REDUCED) rail.scrollLeft = to;
      else gsap.to(rail, { scrollLeft: to, duration: D.slow, ease: EXPO });
    }));
  }

  /* ------------------------------------------------------------------------
     14. NAVEGAÇÃO — âncoras via Lenis, menu móvel
     ------------------------------------------------------------------------ */
  function initNav() {
    const burger = $('.burger');
    const menu = $('#mobile-menu');
    const closeMenu = () => { burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Abrir menu'); menu.classList.remove('is-open'); };
    burger.addEventListener('click', () => {
      const open = burger.getAttribute('aria-expanded') !== 'true';
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      menu.classList.toggle('is-open', open);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href').slice(1);
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      e.preventDefault();
      closeMenu();
      scrollToTarget(target);
      // move o foco para o destino (acessibilidade de teclado)
      if (id !== 'top') {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    });
    $('.skip-link').addEventListener('click', () => $('#main').focus({ preventScroll: true }));
  }

  /* ------------------------------------------------------------------------
     15. BOOT
     ------------------------------------------------------------------------ */
  function boot() {
    if (seq) seq.start(MOBILE() ? 4 : 6);
    initNav();
    initButtons();
    initCursor();
    initBenefits();
    initMarquee();
    initFlowDividers();
    // o pin do filme precisa existir ANTES dos triggers abaixo dele (eles somam o pin-spacer)
    initScrub();
    initAnatomy();     // 2º pin da página: também antes dos triggers do trilho
    initRail();
    heroInteractions();

    // reposiciona a caneta antes de cada refresh do ScrollTrigger (resize, fontes)
    ScrollTrigger.addEventListener('refreshInit', placePen);

    runPreloader().then(() => {
      body.classList.remove('is-loading');
      placePen();                                   // fontes já carregadas: métricas reais
      heroIntro();
      if (seq) gsap.delayedCall(1.2, () => seq.release());   // fase 2 dos quadros
      // libera o scroll quando os CTAs já estão subindo (a intro não é "atropelada")
      if (lenis) gsap.delayedCall(REDUCED ? 0 : 1.6, () => lenis.start());
      // Reveals só depois das fontes (SplitText mede linhas reais)
      document.fonts.ready.then(() => {
        initReveals();
        ScrollTrigger.refresh();
      });
    });

    // Recalcula quando a mídia lazy terminar de carregar (alturas definitivas)
    window.addEventListener('load', () => ScrollTrigger.refresh());
  }

  boot();
})();
