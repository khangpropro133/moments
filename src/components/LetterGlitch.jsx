import { useEffect, useRef } from 'react';

const DEFAULT_CHARS =
  'abcdefghijklmnopqrstuvwxyz0123456789.:;+-=~*/\\[]{}<>·';

const DEFAULT_COLORS = ['#181818', '#252525', '#363636', '#4c4c4c', '#626262'];

const METEOR_HEAD_CHARS = '@*#0✦¤%';
const METEOR_CORE_CHARS = '#*%+=@';
const METEOR_SPARK_CHARS = '*+·.,\'`';

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function pick(str) {
  return str[Math.floor(Math.random() * str.length)];
}

/**
 * Lively black-theme ASCII background with drifting multi-layer glyphs,
 * gentle flowing waves, cursor ripples, and shooting ASCII meteors.
 */
export default function LetterGlitch({
  glitchColors = DEFAULT_COLORS,
  glitchSpeed = 85,
  density = 0.34,
  updateFraction = 0.022,
  fontSize = 13,
  cellWidth = 24,
  cellHeight = 28,
  centerCalm = 0.65,
  driftSpeedX = -11,
  driftSpeedY = 6.5,
  meteorsEnabled = true,
  interactive = true,
  cursorRadius = 125,
  paused = false,
  characters = DEFAULT_CHARS,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const palette = glitchColors.map(hexToRgb);
    const reducedMotionQuery = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    );

    let animationFrameId = null;
    let cols = 0;
    let rows = 0;
    let width = 0;
    let height = 0;
    let wrapWidth = 0;
    let wrapHeight = 0;
    let cells = [];

    let lastFrameTime = performance.now();
    let lastGlitchTime = lastFrameTime;
    let driftX = 0;
    let driftY = 0;

    // Active ASCII meteors & stray sparks
    const meteors = [];
    const sparks = [];
    let nextMeteorAt = lastFrameTime + 1100;

    const pointer = {
      x: -9999,
      y: -9999,
      active: false,
      lastMove: 0,
    };

    const randomChar = () => pick(characters);
    const randomColor = () =>
      palette[Math.floor(Math.random() * palette.length)];

    function computeHorizontalCalm(screenX) {
      if (width <= 0 || centerCalm <= 0) return 1;
      const normX = Math.max(0, Math.min(1, screenX / width));
      const distFromCenter = Math.abs(normX - 0.5) * 2; // 0 at center, 1 at edges
      const smoothEdge = Math.pow(distFromCenter, 1.3);
      return 1 - centerCalm * (1 - smoothEdge);
    }

    function initGrid() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Extra 2 columns/rows so drifting wraps around off-screen seamlessly
      cols = Math.ceil(width / cellWidth) + 2;
      rows = Math.ceil(height / cellHeight) + 2;
      wrapWidth = cols * cellWidth;
      wrapHeight = rows * cellHeight;

      cells = new Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const visible = Math.random() < density;
          const base = randomColor();
          const target = randomColor();
          const baseAlpha = visible ? 0.25 + Math.random() * 0.65 : 0;

          // Parallax depth: slow background dust, normal grid, faster glints
          const layerRoll = Math.random();
          const speedMul =
            layerRoll < 0.45 ? 0.62 : layerRoll < 0.86 ? 1.0 : 1.42;

          cells[r * cols + c] = {
            baseX: c * cellWidth,
            baseY: r * cellHeight,
            speedMul,
            phase: Math.random() * Math.PI * 2,
            char: randomChar(),
            r: base.r,
            g: base.g,
            b: base.b,
            tr: target.r,
            tg: target.g,
            tb: target.b,
            alpha: baseAlpha,
            targetAlpha: baseAlpha,
            hoverBoost: 0,
          };
        }
      }
    }

    function spawnMeteor(now, originOverride = null) {
      if (width <= 0 || height <= 0) return;

      // Randomly sweep either upper-right -> lower-left or upper-left -> lower-right
      const goLeft = Math.random() < 0.58;
      const angleDeg = goLeft
        ? 128 + Math.random() * 24 // ~128° to 152°
        : 28 + Math.random() * 24; // ~28° to 52°
      const angle = (angleDeg * Math.PI) / 180;

      const speed = 430 + Math.random() * 250;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      let startX;
      let startY;
      if (originOverride) {
        startX = originOverride.x;
        startY = originOverride.y;
      } else if (goLeft) {
        startX = width * (0.35 + Math.random() * 0.7);
        startY = -20 + Math.random() * (height * 0.32);
      } else {
        startX = width * (-0.05 + Math.random() * 0.7);
        startY = -20 + Math.random() * (height * 0.32);
      }

      const maxDuration = 0.85 + Math.random() * 0.85;
      const streakChars = goLeft ? '/=-~:·.' : '\\=-~:·.';

      meteors.push({
        x: startX,
        y: startY,
        vx,
        vy,
        age: 0,
        maxDuration,
        headDead: false,
        headChar: pick(METEOR_HEAD_CHARS),
        streakChars,
        lastSampleX: startX,
        lastSampleY: startY,
        lastSparkAt: now,
        trail: [
          {
            x: startX,
            y: startY,
            age: 0,
            maxAge: 0.55,
            char: pick(METEOR_CORE_CHARS),
          },
        ],
      });
    }

    function stepGlitch() {
      const total = cells.length;
      if (total === 0) return;

      const updates = Math.max(1, Math.floor(total * updateFraction));
      for (let i = 0; i < updates; i++) {
        const idx = Math.floor(Math.random() * total);
        const cell = cells[idx];
        const shouldShow = Math.random() < density;

        if (shouldShow) {
          if (Math.random() < 0.75) {
            cell.char = randomChar();
          }
          const nextColor = randomColor();
          cell.tr = nextColor.r;
          cell.tg = nextColor.g;
          cell.tb = nextColor.b;
          cell.targetAlpha = 0.24 + Math.random() * 0.68;
        } else {
          cell.targetAlpha = 0;
        }
      }
    }

    function updateMeteorsAndSparks(dt, now) {
      if (meteorsEnabled && now >= nextMeteorAt && meteors.length < 4) {
        spawnMeteor(now);
        // Occasional double meteor shower
        if (Math.random() < 0.2) {
          nextMeteorAt = now + 320 + Math.random() * 450;
        } else {
          nextMeteorAt = now + 2600 + Math.random() * 3600;
        }
      }

      for (let m = meteors.length - 1; m >= 0; m--) {
        const meteor = meteors[m];

        if (!meteor.headDead) {
          meteor.age += dt;
          meteor.x += meteor.vx * dt;
          meteor.y += meteor.vy * dt;

          if (Math.random() < 0.45) {
            meteor.headChar = pick(METEOR_HEAD_CHARS);
          }

          // Drop ASCII trail glyphs every ~13px along trajectory
          const dx = meteor.x - meteor.lastSampleX;
          const dy = meteor.y - meteor.lastSampleY;
          const dist = Math.hypot(dx, dy);
          if (dist >= 13) {
            const steps = Math.min(5, Math.floor(dist / 13));
            for (let s = 1; s <= steps; s++) {
              const t = s / steps;
              const tx = meteor.lastSampleX + dx * t;
              const ty = meteor.lastSampleY + dy * t;
              meteor.trail.unshift({
                x: tx,
                y: ty,
                age: 0,
                maxAge: 0.48 + Math.random() * 0.24,
                char: pick(meteor.streakChars),
              });
            }
            if (meteor.trail.length > 26) {
              meteor.trail.length = 26;
            }
            meteor.lastSampleX = meteor.x;
            meteor.lastSampleY = meteor.y;
          }

          // Shed occasional tiny ASCII sparks off the tail
          if (now - meteor.lastSparkAt > 42 && sparks.length < 64) {
            meteor.lastSparkAt = now;
            if (Math.random() < 0.65) {
              sparks.push({
                x: meteor.x + (Math.random() - 0.5) * 10,
                y: meteor.y + (Math.random() - 0.5) * 10,
                vx: meteor.vx * 0.08 + (Math.random() - 0.5) * 46,
                vy: meteor.vy * 0.08 + 12 + Math.random() * 34,
                age: 0,
                maxAge: 0.35 + Math.random() * 0.4,
                char: pick(METEOR_SPARK_CHARS),
              });
            }
          }

          const outOfBounds =
            meteor.x < -120 ||
            meteor.x > width + 120 ||
            meteor.y < -120 ||
            meteor.y > height + 120;

          if (meteor.age >= meteor.maxDuration || outOfBounds) {
            meteor.headDead = true;
          }
        }

        // Age & scramble trail nodes
        for (let t = meteor.trail.length - 1; t >= 0; t--) {
          const node = meteor.trail[t];
          node.age += dt;
          if (node.age >= node.maxAge) {
            meteor.trail.splice(t, 1);
            continue;
          }
          const lifeRatio = node.age / node.maxAge;
          if (lifeRatio < 0.25 && Math.random() < 0.22) {
            node.char = pick(METEOR_CORE_CHARS);
          } else if (lifeRatio > 0.65 && Math.random() < 0.14) {
            node.char = pick('·.,\'`');
          }
        }

        if (meteor.headDead && meteor.trail.length === 0) {
          meteors.splice(m, 1);
        }
      }

      // Update sparks
      for (let s = sparks.length - 1; s >= 0; s--) {
        const sp = sparks[s];
        sp.age += dt;
        if (sp.age >= sp.maxAge) {
          sparks.splice(s, 1);
          continue;
        }
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        if (Math.random() < 0.12) {
          sp.char = pick(METEOR_SPARK_CHARS);
        }
      }
    }

    function drawMeteorsAndSparks() {
      // Draw stray ASCII sparks
      for (let s = 0; s < sparks.length; s++) {
        const sp = sparks[s];
        const fade = 1 - sp.age / sp.maxAge;
        const calm = 0.55 + 0.45 * computeHorizontalCalm(sp.x);
        const alpha = fade * fade * 0.65 * calm;
        if (alpha < 0.03) continue;

        const shade = Math.round(95 + 115 * fade);
        ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${alpha.toFixed(3)})`;
        ctx.fillText(sp.char, sp.x, sp.y);
      }

      // Draw each meteor's ASCII trail and glowing head
      for (let m = 0; m < meteors.length; m++) {
        const meteor = meteors[m];
        const headEnvelope = meteor.headDead
          ? 0
          : Math.min(1, meteor.age / 0.12) *
            Math.min(1, (meteor.maxDuration - meteor.age) / 0.22);

        for (let t = meteor.trail.length - 1; t >= 0; t--) {
          const node = meteor.trail[t];
          const progress = 1 - node.age / node.maxAge; // 1 near head, 0 at end
          const calm = 0.5 + 0.5 * computeHorizontalCalm(node.x);
          const alpha = Math.pow(progress, 1.45) * 0.78 * calm;
          if (alpha < 0.025) continue;

          const shade = Math.round(48 + 175 * Math.pow(progress, 1.3));
          ctx.fillStyle = `rgba(${shade}, ${shade}, ${Math.min(255, shade + 8)}, ${alpha.toFixed(3)})`;
          ctx.fillText(node.char, node.x, node.y);
        }

        if (!meteor.headDead && headEnvelope > 0.04) {
          const calm = 0.58 + 0.42 * computeHorizontalCalm(meteor.x);
          const headAlpha = Math.min(0.95, headEnvelope * 0.92 * calm);

          ctx.save();
          ctx.shadowColor = 'rgba(235, 240, 255, 0.55)';
          ctx.shadowBlur = 8;
          ctx.fillStyle = `rgba(245, 247, 250, ${headAlpha.toFixed(3)})`;
          ctx.fillText(meteor.headChar, meteor.x, meteor.y);
          ctx.restore();
        }
      }
    }

    function drawFrame(now) {
      const isStatic = paused || reducedMotionQuery.matches;
      const dt = Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
      lastFrameTime = now;

      if (!isStatic) {
        driftX += driftSpeedX * dt;
        driftY += driftSpeedY * dt;

        if (now - lastGlitchTime >= glitchSpeed) {
          stepGlitch();
          lastGlitchTime = now;
        }

        updateMeteorsAndSparks(dt, now);
      }

      ctx.clearRect(0, 0, width, height);
      ctx.font = `${fontSize}px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.textBaseline = 'top';

      const pointerFresh =
        interactive &&
        !isStatic &&
        pointer.active &&
        now - pointer.lastMove < 1200;
      const radiusSq = cursorRadius * cursorRadius;
      const meteorWakeSq = 72 * 72;

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];

        if (!isStatic) {
          cell.r += (cell.tr - cell.r) * 0.08;
          cell.g += (cell.tg - cell.g) * 0.08;
          cell.b += (cell.tb - cell.b) * 0.08;
          cell.alpha += (cell.targetAlpha - cell.alpha) * 0.06;
        }

        // Wrap coordinates seamlessly as the background drifts + gentle wave sway
        const swayX = isStatic
          ? 0
          : Math.sin(now * 0.00075 + cell.phase) * 3.2;
        const swayY = isStatic
          ? 0
          : Math.cos(now * 0.00062 + cell.phase) * 2.2;

        const rawX =
          (cell.baseX + driftX * cell.speedMul + swayX) % wrapWidth;
        const rawY =
          (cell.baseY + driftY * cell.speedMul + swayY) % wrapHeight;

        const x = (rawX < 0 ? rawX + wrapWidth : rawX) - cellWidth;
        const y = (rawY < 0 ? rawY + wrapHeight : rawY) - cellHeight;

        if (
          x < -cellWidth ||
          x > width + cellWidth ||
          y < -cellHeight ||
          y > height + cellHeight
        ) {
          continue;
        }

        // Cursor ripple
        if (pointerFresh) {
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < radiusSq) {
            const proximity = 1 - Math.sqrt(distSq) / cursorRadius;
            cell.hoverBoost = Math.max(cell.hoverBoost, proximity * 0.58);
            if (Math.random() < 0.04 * proximity) {
              cell.char = randomChar();
            }
          }
        }

        // Meteor shockwave lights up & scrambles nearby grid letters as it flies past
        if (!isStatic && meteors.length > 0) {
          for (let m = 0; m < meteors.length; m++) {
            const meteor = meteors[m];
            if (meteor.headDead) continue;
            const mdx = x - meteor.x;
            const mdy = y - meteor.y;
            const mDistSq = mdx * mdx + mdy * mdy;
            if (mDistSq < meteorWakeSq) {
              const wake = 1 - Math.sqrt(mDistSq) / 72;
              cell.hoverBoost = Math.max(cell.hoverBoost, wake * 0.78);
              if (Math.random() < 0.14 * wake) {
                cell.char = randomChar();
              }
            }
          }
        }

        if (cell.hoverBoost > 0.004) {
          cell.hoverBoost *= 0.94;
        } else {
          cell.hoverBoost = 0;
        }

        // Traveling ambient wave ripple across the moving sky
        const wave = isStatic
          ? 0
          : (Math.sin(x * 0.006 + y * 0.005 - now * 0.0017) + 1) * 0.5;
        const waveBoost = wave * 0.16;

        const colFactor = computeHorizontalCalm(x);
        const effectiveAlpha = Math.min(
          0.9,
          (cell.alpha + waveBoost) * colFactor + cell.hoverBoost * 0.7
        );

        if (effectiveAlpha < 0.025) continue;

        const boost = cell.hoverBoost * 88 + wave * 14;
        const cr = Math.min(255, Math.round(cell.r + boost));
        const cg = Math.min(255, Math.round(cell.g + boost));
        const cb = Math.min(255, Math.round(cell.b + boost));

        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${effectiveAlpha.toFixed(3)})`;
        ctx.fillText(cell.char, x, y);
      }

      if (!isStatic) {
        drawMeteorsAndSparks();
        animationFrameId = window.requestAnimationFrame(drawFrame);
      }
    }

    let resizeTimer = null;
    function handleResize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        initGrid();
        drawFrame(performance.now());
      }, 90);
    }

    function handlePointerMove(e) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
      pointer.lastMove = performance.now();
    }

    function handlePointerLeave() {
      pointer.active = false;
    }

    function handleWindowClick(e) {
      if (paused || reducedMotionQuery.matches || !meteorsEnabled) return;
      const interactiveEl = e.target.closest?.(
        'button, input, textarea, a, video, label, .composer-card, .moment-card, .lightbox-backdrop, .modal-backdrop'
      );
      if (interactiveEl) return;
      spawnMeteor(performance.now(), {
        x: e.clientX,
        y: Math.max(10, e.clientY - 30),
      });
    }

    initGrid();
    drawFrame(performance.now());

    window.addEventListener('resize', handleResize);
    if (interactive) {
      window.addEventListener('mousemove', handlePointerMove, {
        passive: true,
      });
      window.addEventListener('mouseleave', handlePointerLeave);
      window.addEventListener('click', handleWindowClick);
    }

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseleave', handlePointerLeave);
      window.removeEventListener('click', handleWindowClick);
    };
  }, [
    glitchColors,
    glitchSpeed,
    density,
    updateFraction,
    fontSize,
    cellWidth,
    cellHeight,
    centerCalm,
    driftSpeedX,
    driftSpeedY,
    meteorsEnabled,
    interactive,
    cursorRadius,
    paused,
    characters,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="ascii-canvas"
      aria-hidden="true"
    />
  );
}
