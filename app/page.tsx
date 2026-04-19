'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { SLIDE_PRESETS } from '@/lib/slide-presets';

// Landing page. Zero external chrome — just the app.
// Sections: hero, logo marquee, features, how-it-works, preset gallery,
// comparison (vs Canva / Figma / CapCut), final CTA.

export default function Home() {
  return (
    <main style={{ background: '#060606', color: '#fff', minHeight: '100vh', overflowX: 'hidden' }}>
      <TopNav />
      <Hero />
      <LogoMarquee />
      <Features />
      <HowItWorks />
      <PresetGallery />
      <Comparison />
      <StatsBand />
      <FinalCta />
      <Footer />
    </main>
  );
}

// ── Top nav ──────────────────────────────────────────────────────────────────

function TopNav() {
  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(6,6,6,0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid #141414',
      }}
    >
      <div
        style={{
          maxWidth: 1440,
          margin: '0 auto',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
        }}
      >
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none',
            color: '#fff',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 40 40" aria-hidden>
            <defs>
              <linearGradient id="nav-logo" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ccff00" />
                <stop offset="50%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#ff3d7f" />
              </linearGradient>
            </defs>
            <rect x="2" y="2" width="36" height="36" rx="8" fill="url(#nav-logo)" />
            <path d="M12 28 L20 12 L28 28 Z" fill="#000" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 800,
              fontSize: 16,
              letterSpacing: '-0.02em',
            }}
          >
            VisioReels
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link
            href="/slides"
            style={{
              fontFamily: 'var(--font-dm-mono)',
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#bbb',
              textDecoration: 'none',
            }}
          >
            Slides
          </Link>
          <Link
            href="/editor"
            style={{
              fontFamily: 'var(--font-dm-mono)',
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#bbb',
              textDecoration: 'none',
            }}
          >
            Editor
          </Link>
          <Link href="/slides" className="lp-btn-primary" style={{ padding: '10px 18px', fontSize: 11 }}>
            Launch studio →
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  const heroRef = useRef<HTMLDivElement>(null);

  return (
    <section
      ref={heroRef}
      style={{
        position: 'relative',
        minHeight: '92vh',
        padding: '80px 24px 120px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Animated orbs */}
      <div className="lp-orb" style={{ top: '10%', left: '8%', width: 420, height: 420, background: '#ccff00', opacity: 0.12, animationDelay: '0s' }} />
      <div className="lp-orb" style={{ top: '30%', right: '5%', width: 520, height: 520, background: '#a855f7', opacity: 0.14, animationDelay: '-6s' }} />
      <div className="lp-orb" style={{ bottom: '5%', left: '30%', width: 380, height: 380, background: '#ff3d7f', opacity: 0.09, animationDelay: '-12s' }} />

      {/* Grid backdrop */}
      <div
        className="lp-grid-bg"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 1100 }}>
        <div
          style={{
            fontFamily: 'var(--font-dm-mono)',
            fontSize: 11,
            letterSpacing: '0.3em',
            color: '#ccff00',
            textTransform: 'uppercase',
            marginBottom: 32,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 16px',
            border: '1px solid #ccff0030',
            borderRadius: 100,
            background: 'rgba(204,255,0,0.04)',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#ccff00',
              animation: 'lp-pulse-dot 2s ease-in-out infinite',
            }}
          />
          Vision-powered · local-first · print-ready
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-syne)',
            fontSize: 'clamp(3rem, 11vw, 9rem)',
            fontWeight: 800,
            lineHeight: 0.9,
            letterSpacing: '-0.04em',
            margin: 0,
            marginBottom: 28,
          }}
        >
          <span style={{ display: 'block' }}>
            {'Ship carousels'.split('').map((ch, i) => (
              <span
                key={i}
                className="lp-wordmark-letter"
                style={{
                  animationDelay: `${i * 0.04}s`,
                  whiteSpace: ch === ' ' ? 'pre' : 'normal',
                }}
              >
                {ch}
              </span>
            ))}
          </span>
          <span className="lp-shimmer-text" style={{ display: 'block', fontStyle: 'italic' }}>
            Canva can&apos;t touch.
          </span>
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-instrument-serif)',
            fontSize: 'clamp(1.2rem, 2.2vw, 1.8rem)',
            lineHeight: 1.4,
            color: '#aaa',
            maxWidth: 720,
            margin: '0 auto 48px',
          }}
        >
          Drop photos. Gemma&nbsp;4 <em style={{ color: '#ccff00', fontStyle: 'italic' }}>sees</em> them,
          picks the perfect typography, writes the copy — all on your machine.
          Zero API cost. Native resolution. Ready for Instagram, TikTok, print.
        </p>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/slides" className="lp-btn-primary">
            Create slides
            <span>→</span>
          </Link>
          <Link href="/editor" className="lp-btn-ghost">
            Open video editor
          </Link>
        </div>

        {/* Stat chip row */}
        <div
          style={{
            marginTop: 72,
            display: 'flex',
            gap: 48,
            justifyContent: 'center',
            flexWrap: 'wrap',
            fontFamily: 'var(--font-dm-mono)',
            fontSize: 11,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#666',
          }}
        >
          <Stat label="Presets" value="18" />
          <Stat label="Local model" value="Gemma 4" />
          <Stat label="API cost" value="$0" />
          <Stat label="Max slides" value="10" />
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        style={{
          position: 'absolute',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: 'var(--font-dm-mono)',
          fontSize: 10,
          letterSpacing: '0.3em',
          color: '#444',
          textTransform: 'uppercase',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span>Scroll</span>
        <span
          style={{
            width: 1,
            height: 48,
            background: 'linear-gradient(180deg, #555 0%, transparent 100%)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 16,
              background: '#ccff00',
              animation: 'lp-scan 2s ease-in-out infinite',
            }}
          />
        </span>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color: '#ccff00', fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{value}</div>
      <div>{label}</div>
    </div>
  );
}

// ── Logo / tool marquee ──────────────────────────────────────────────────────

function LogoMarquee() {
  const items = [
    'Instagram', '— feed', '— stories', 'TikTok', '— shorts',
    'LinkedIn', '— carousel', 'Pinterest', '— pin', 'X',
    '— post', 'YouTube', '— shorts cover', 'Print', '— full-res',
  ];
  const doubled = [...items, ...items];
  return (
    <section
      style={{
        padding: '48px 0',
        borderTop: '1px solid #101010',
        borderBottom: '1px solid #101010',
        background: '#040404',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div className="lp-marquee-track">
        {doubled.map((item, i) => (
          <span
            key={i}
            style={{
              fontFamily: item.startsWith('—') ? 'var(--font-instrument-serif)' : 'var(--font-syne)',
              fontSize: item.startsWith('—') ? 18 : 22,
              fontWeight: item.startsWith('—') ? 400 : 800,
              color: item.startsWith('—') ? '#555' : '#fff',
              letterSpacing: '-0.01em',
              fontStyle: item.startsWith('—') ? 'italic' : 'normal',
            }}
          >
            {item}
          </span>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, #040404 0%, transparent 10%, transparent 90%, #040404 100%)',
          pointerEvents: 'none',
        }}
      />
    </section>
  );
}

// ── Features grid ────────────────────────────────────────────────────────────

function Features() {
  return (
    <section style={{ padding: '120px 24px', maxWidth: 1440, margin: '0 auto' }}>
      <header style={{ marginBottom: 64, maxWidth: 720 }}>
        <div className="lp-section-label" style={{ marginBottom: 20 }}>01 — What it does</div>
        <h2
          style={{
            fontFamily: 'var(--font-syne)',
            fontSize: 'clamp(2.5rem, 6vw, 5rem)',
            fontWeight: 800,
            lineHeight: 0.95,
            letterSpacing: '-0.03em',
            margin: 0,
          }}
        >
          Six things tools like Canva <em style={{ fontStyle: 'italic', color: '#555' }}>simply cannot do</em>.
        </h2>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
        }}
      >
        <FeatureCard
          tag="Vision AI"
          title="Gemma actually sees your photos"
          body="Not metadata. Not filenames. The model opens each image, describes the scene, and writes copy that matches what it sees."
          accent="#ccff00"
          demo={<VisionDemo />}
        />
        <FeatureCard
          tag="Auto-pilot"
          title="Picks the right preset for you"
          body="Moody night shot? Noir. Pastel sunset? Vaporwave. The auto-picker scores all 18 presets against palette, brightness and mood, then renders."
          accent="#a855f7"
          demo={<AutoPilotDemo />}
        />
        <FeatureCard
          tag="Native res"
          title="Exports at source resolution"
          body="No downscaling, no JPEG artefacts. Drop a 6000×4000 RAW, get back a 6000×4000 PNG with text overlayed at the correct scale."
          accent="#00f0ff"
          demo={<ResolutionDemo />}
        />
        <FeatureCard
          tag="Local-first"
          title="Never leaves your machine"
          body="Ollama + Gemma 4 runs on your GPU. No cloud round-trips, no usage caps, no API bills. Your photos stay yours."
          accent="#ff3d7f"
          demo={<LocalDemo />}
        />
        <FeatureCard
          tag="18 presets"
          title="Trending typographic systems"
          body="Editorial, Noir, Cyberpunk, Y2K, Polaroid, Zen, Vaporwave, Risograph… each is a complete design language, not a filter."
          accent="#ffb72a"
          demo={<PresetDemo />}
        />
        <FeatureCard
          tag="Plus video"
          title="Carousels and cinematic reels"
          body="Same engine powers a Remotion video editor. Write a brief, get a rendered MP4 with timeline, captions and transitions."
          accent="#22d3a0"
          demo={<VideoDemo />}
        />
      </div>
    </section>
  );
}

function FeatureCard({
  tag,
  title,
  body,
  accent,
  demo,
}: {
  tag: string;
  title: string;
  body: string;
  accent: string;
  demo?: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty('--mx', `${x}%`);
      el.style.setProperty('--my', `${y}%`);
    };
    el.addEventListener('mousemove', handle);
    return () => el.removeEventListener('mousemove', handle);
  }, []);

  return (
    <article ref={ref} className="lp-feature-card" style={{ minHeight: 360, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 8,
          padding: '5px 12px',
          border: `1px solid ${accent}40`,
          color: accent,
          borderRadius: 100,
          fontFamily: 'var(--font-dm-mono)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          marginBottom: 18,
        }}
      >
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: accent }} />
        {tag}
      </div>
      <h3
        style={{
          fontFamily: 'var(--font-syne)',
          fontSize: '1.6rem',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
          margin: 0,
          marginBottom: 14,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 14,
          lineHeight: 1.6,
          color: '#888',
          margin: 0,
          marginBottom: 24,
          flex: 1,
        }}
      >
        {body}
      </p>
      {demo && (
        <div
          style={{
            marginTop: 'auto',
            padding: 14,
            border: '1px dashed #222',
            borderRadius: 4,
            background: '#050505',
            minHeight: 90,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {demo}
        </div>
      )}
    </article>
  );
}

// ── Feature micro-demos ──────────────────────────────────────────────────────

function VisionDemo() {
  return (
    <svg width="100%" height="72" viewBox="0 0 200 72" aria-hidden>
      <defs>
        <linearGradient id="vd-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ccff00" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#222" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="60" height="60" rx="2" fill="url(#vd-sky)" />
      <path d="M6 46 L26 34 L42 42 L66 28 L66 66 L6 66 Z" fill="#111" />
      <g style={{ transformOrigin: '100px 36px', animation: 'lp-pulse-dot 2.4s ease-in-out infinite' }}>
        <circle cx="90" cy="26" r="2" fill="#ccff00" />
        <circle cx="106" cy="34" r="2" fill="#ccff00" />
        <circle cx="94" cy="48" r="2" fill="#ccff00" />
      </g>
      <text x="120" y="22" fontFamily="var(--font-dm-mono)" fontSize="9" fill="#ccff00" letterSpacing="0.1em">SUBJECT</text>
      <rect x="120" y="28" width="70" height="6" fill="#222" />
      <rect x="120" y="28" width="50" height="6" fill="#ccff00" />
      <text x="120" y="48" fontFamily="var(--font-dm-mono)" fontSize="9" fill="#666" letterSpacing="0.1em">MOOD</text>
      <rect x="120" y="54" width="70" height="6" fill="#222" />
      <rect x="120" y="54" width="34" height="6" fill="#a855f7" />
    </svg>
  );
}

function AutoPilotDemo() {
  const presets = ['EDITORIAL', 'NOIR', 'CYBERPUNK', 'POLAROID', 'ZEN'];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
      {presets.map((p, i) => (
        <div
          key={p}
          style={{
            padding: '5px 10px',
            border: i === 2 ? '1px solid #a855f7' : '1px solid #222',
            background: i === 2 ? 'rgba(168,85,247,0.15)' : '#080808',
            color: i === 2 ? '#fff' : '#555',
            fontFamily: 'var(--font-dm-mono)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.12em',
            borderRadius: 100,
            boxShadow: i === 2 ? '0 0 16px rgba(168,85,247,0.35)' : 'none',
          }}
        >
          {p}
        </div>
      ))}
    </div>
  );
}

function ResolutionDemo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: '#888' }}>
      <span style={{ color: '#00f0ff', fontWeight: 700 }}>6000×4000</span>
      <span style={{ color: '#444' }}>→</span>
      <span style={{ color: '#00f0ff', fontWeight: 700 }}>6000×4000</span>
      <span style={{ color: '#444' }}>·</span>
      <span style={{ color: '#666' }}>PNG lossless</span>
    </div>
  );
}

function LocalDemo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-dm-mono)', fontSize: 11 }}>
      <span style={{ color: '#ff3d7f', fontWeight: 700 }}>[GPU]</span>
      <span style={{ color: '#444' }}>→</span>
      <span style={{ color: '#888' }}>localhost:11434</span>
      <span style={{ color: '#444' }}>·</span>
      <span style={{ color: '#666' }}>0 bytes sent</span>
    </div>
  );
}

function PresetDemo() {
  const colors = ['#ccff00', '#ffb72a', '#ff3d7f', '#a855f7', '#00f0ff', '#22d3a0'];
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {colors.map((c) => (
        <span
          key={c}
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            background: c,
            boxShadow: `0 0 12px ${c}40`,
          }}
        />
      ))}
    </div>
  );
}

function VideoDemo() {
  return (
    <svg width="100%" height="50" viewBox="0 0 200 50" aria-hidden>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <rect
          key={i}
          x={20 + i * 22}
          y={20 - (i % 3) * 3}
          width="14"
          height={10 + (i % 3) * 6}
          fill="#22d3a0"
          opacity={0.3 + (i % 3) * 0.25}
        />
      ))}
      <line x1="10" y1="40" x2="195" y2="40" stroke="#222" strokeWidth="1" />
      <text x="10" y="12" fontFamily="var(--font-dm-mono)" fontSize="8" fill="#22d3a0" letterSpacing="0.1em">TIMELINE</text>
    </svg>
  );
}

// ── How it works ─────────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'Drop photos',
      body: 'Up to 10 images. JPG, PNG, any resolution. Drag a folder, paste from clipboard, or use the file picker.',
      color: '#ccff00',
    },
    {
      n: '02',
      title: 'Gemma looks + writes',
      body: 'Each image is sent to the local vision model. It describes subject, mood, objects. The auto-picker chooses your preset.',
      color: '#a855f7',
    },
    {
      n: '03',
      title: 'Export native-res',
      body: 'Download 10 lossless PNGs at the exact resolution of your source images. Print-ready. No watermarks. No subscriptions.',
      color: '#00f0ff',
    },
  ];
  return (
    <section style={{ padding: '120px 24px', background: '#040404', borderTop: '1px solid #101010', borderBottom: '1px solid #101010' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>
        <header style={{ marginBottom: 64, maxWidth: 720 }}>
          <div className="lp-section-label" style={{ marginBottom: 20 }}>02 — How it works</div>
          <h2
            style={{
              fontFamily: 'var(--font-syne)',
              fontSize: 'clamp(2.5rem, 6vw, 5rem)',
              fontWeight: 800,
              lineHeight: 0.95,
              letterSpacing: '-0.03em',
              margin: 0,
            }}
          >
            Three steps. <span style={{ color: '#555' }}>No learning curve.</span>
          </h2>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 0, border: '1px solid #161616', borderRadius: 6, overflow: 'hidden' }}>
          {steps.map((s, i) => (
            <div
              key={s.n}
              className="lp-step"
              style={{
                padding: 40,
                borderRight: i < steps.length - 1 ? '1px solid #161616' : 'none',
                background: '#080808',
                transition: 'background 0.3s',
                cursor: 'default',
              }}
            >
              <div className="lp-step-number">{s.n}</div>
              <h3
                style={{
                  fontFamily: 'var(--font-syne)',
                  fontSize: '1.7rem',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  margin: 0,
                  marginTop: 8,
                  marginBottom: 14,
                  color: '#fff',
                }}
              >
                {s.title}
              </h3>
              <p style={{ color: '#888', fontSize: 14, lineHeight: 1.65, margin: 0 }}>{s.body}</p>
              <div
                style={{
                  marginTop: 24,
                  width: 32,
                  height: 3,
                  background: s.color,
                  borderRadius: 100,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Preset gallery ───────────────────────────────────────────────────────────

function PresetGallery() {
  const presets = [...SLIDE_PRESETS, ...SLIDE_PRESETS];
  return (
    <section style={{ padding: '120px 0 80px', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 24px 48px' }}>
        <div className="lp-section-label" style={{ marginBottom: 20 }}>03 — The library</div>
        <h2
          style={{
            fontFamily: 'var(--font-syne)',
            fontSize: 'clamp(2.5rem, 6vw, 5rem)',
            fontWeight: 800,
            lineHeight: 0.95,
            letterSpacing: '-0.03em',
            margin: 0,
            marginBottom: 18,
          }}
        >
          {SLIDE_PRESETS.length} typographic systems.
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-instrument-serif)',
            fontSize: '1.4rem',
            color: '#888',
            maxWidth: 720,
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          Each one&apos;s a complete design language — fonts, weights, case, tracking, overlay, palette. Not a preset. Not a filter. A <em style={{ color: '#ccff00' }}>voice</em>.
        </p>
      </div>

      <div style={{ position: 'relative' }}>
        <div className="lp-marquee-track" style={{ padding: '16px 0' }}>
          {presets.map((p, i) => (
            <div
              key={`${p.id}-${i}`}
              className="lp-preset-tag"
              style={{ ['--tag-dot' as string]: p.accent }}
            >
              <span style={{ fontFamily: p.titleFontVar, fontWeight: p.titleWeight, color: '#fff', fontSize: 13, textTransform: 'none', letterSpacing: p.titleTracking }}>
                {p.label}
              </span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span style={{ fontWeight: 400 }}>{p.blurb}</span>
            </div>
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, #060606 0%, transparent 8%, transparent 92%, #060606 100%)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </section>
  );
}

// ── Comparison table ─────────────────────────────────────────────────────────

function Comparison() {
  const rows: { label: string; visio: string; canva: string; figma: string }[] = [
    { label: 'Reads your photos', visio: 'yes', canva: 'no', figma: 'no' },
    { label: 'Auto-picks preset for you', visio: 'yes', canva: 'no', figma: 'no' },
    { label: 'Native-resolution export', visio: 'yes', canva: '—', figma: 'yes' },
    { label: 'No watermark, no paywall', visio: 'yes', canva: 'no', figma: '—' },
    { label: '100% local, no cloud upload', visio: 'yes', canva: 'no', figma: 'no' },
    { label: 'Generates copy from images', visio: 'yes', canva: '—', figma: 'no' },
    { label: 'Per-slide regeneration', visio: 'yes', canva: 'no', figma: 'no' },
    { label: 'Runs video editor too', visio: 'yes', canva: 'yes', figma: 'no' },
    { label: 'Monthly cost', visio: '$0', canva: '$15', figma: '$15' },
  ];

  return (
    <section style={{ padding: '120px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 48, maxWidth: 720 }}>
        <div className="lp-section-label" style={{ marginBottom: 20 }}>04 — Direct comparison</div>
        <h2
          style={{
            fontFamily: 'var(--font-syne)',
            fontSize: 'clamp(2.5rem, 6vw, 5rem)',
            fontWeight: 800,
            lineHeight: 0.95,
            letterSpacing: '-0.03em',
            margin: 0,
          }}
        >
          Why pay for SaaS that <em style={{ fontStyle: 'italic', color: '#555' }}>can&apos;t see?</em>
        </h2>
      </header>

      <div style={{ border: '1px solid #161616', borderRadius: 6, overflow: 'hidden', background: '#080808' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr',
            background: '#0c0c0c',
            borderBottom: '1px solid #1a1a1a',
          }}
        >
          <div className="lp-vs-cell" style={{ color: '#666' }}>CAPABILITY</div>
          <div className="lp-vs-cell" style={{ color: '#ccff00', fontWeight: 800 }}>VISIOREELS</div>
          <div className="lp-vs-cell" style={{ color: '#888' }}>CANVA</div>
          <div className="lp-vs-cell" style={{ color: '#888' }}>FIGMA</div>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr',
              background: i % 2 === 0 ? '#080808' : '#0a0a0a',
            }}
          >
            <div className="lp-vs-cell" style={{ color: '#ddd', fontFamily: 'var(--font-dm-sans)' }}>
              {r.label}
            </div>
            <MarkCell v={r.visio} tone="pri" />
            <MarkCell v={r.canva} tone="sec" />
            <MarkCell v={r.figma} tone="sec" />
          </div>
        ))}
      </div>
    </section>
  );
}

function MarkCell({ v, tone }: { v: string; tone: 'pri' | 'sec' }) {
  const isYes = v === 'yes';
  const isNo = v === 'no';
  const isDash = v === '—';
  const label = isYes ? '●' : isNo ? '○' : isDash ? '—' : v;
  const colour = isYes
    ? tone === 'pri'
      ? '#ccff00'
      : '#888'
    : isNo
    ? '#333'
    : isDash
    ? '#555'
    : tone === 'pri'
    ? '#ccff00'
    : '#aaa';
  return (
    <div className="lp-vs-cell" style={{ color: colour, fontWeight: isYes ? 800 : 400, fontSize: isYes || isNo ? 16 : 12 }}>
      {label}
    </div>
  );
}

// ── Stats band ───────────────────────────────────────────────────────────────

function StatsBand() {
  return (
    <section
      style={{
        padding: '80px 24px',
        borderTop: '1px solid #101010',
        borderBottom: '1px solid #101010',
        background: '#040404',
      }}
    >
      <div style={{ maxWidth: 1440, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 48, textAlign: 'center' }}>
        {[
          { big: '0', label: 'API keys required', accent: '#ccff00' },
          { big: '18', label: 'Trending presets', accent: '#a855f7' },
          { big: '∞', label: 'Slides generated', accent: '#00f0ff' },
          { big: '< 30s', label: 'Carousel ship time', accent: '#ff3d7f' },
        ].map((s) => (
          <div key={s.label}>
            <div
              style={{
                fontFamily: 'var(--font-syne)',
                fontSize: 'clamp(3rem, 6vw, 5rem)',
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: '-0.04em',
                color: s.accent,
              }}
            >
              {s.big}
            </div>
            <div
              style={{
                marginTop: 12,
                fontFamily: 'var(--font-dm-mono)',
                fontSize: 11,
                letterSpacing: '0.25em',
                color: '#666',
                textTransform: 'uppercase',
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Final CTA ────────────────────────────────────────────────────────────────

function FinalCta() {
  return (
    <section style={{ padding: '140px 24px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      <div
        className="lp-orb"
        style={{ top: '10%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 600, background: '#ccff00', opacity: 0.08 }}
      />
      <div style={{ position: 'relative', zIndex: 2, maxWidth: 900, margin: '0 auto' }}>
        <h2
          style={{
            fontFamily: 'var(--font-syne)',
            fontSize: 'clamp(3rem, 9vw, 7rem)',
            fontWeight: 800,
            lineHeight: 0.92,
            letterSpacing: '-0.04em',
            margin: 0,
            marginBottom: 28,
          }}
        >
          Stop paying <em style={{ fontStyle: 'italic', color: '#555' }}>for tools</em>
          <br />
          <span className="lp-shimmer-text">that still can&apos;t see.</span>
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-instrument-serif)',
            fontSize: '1.4rem',
            color: '#888',
            maxWidth: 620,
            margin: '0 auto 48px',
            lineHeight: 1.45,
          }}
        >
          Free. Local. Yours. Runs on the GPU you already own.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/slides" className="lp-btn-primary">
            Open Slides Studio
          </Link>
          <Link href="/editor" className="lp-btn-ghost">
            Or the video editor
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer
      style={{
        padding: '48px 24px 32px',
        borderTop: '1px solid #101010',
        background: '#040404',
        color: '#555',
      }}
    >
      <div
        style={{
          maxWidth: 1440,
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 20,
          flexWrap: 'wrap',
          fontFamily: 'var(--font-dm-mono)',
          fontSize: 11,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
        }}
      >
        <div>© {new Date().getFullYear()} VisioReels · local-first studio</div>
        <div style={{ display: 'flex', gap: 20 }}>
          <span>Gemma 4</span>
          <span>Remotion</span>
          <span>Next.js</span>
          <span style={{ color: '#ccff00' }}>●</span>
          <span>online</span>
        </div>
      </div>
    </footer>
  );
}
