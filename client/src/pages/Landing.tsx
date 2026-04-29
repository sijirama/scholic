import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ChevronRight } from 'lucide-react';
import api from '../lib/api';
import Navbar from '../components/Navbar';
import ReactionStrip from '../components/ReactionStrip';
import MentionText from '../components/MentionText';

// ── Types ──────────────────────────────────────────────────────────────────────

interface LandingAnnotation {
  id: number;
  quoteText?: string;
  text?: string;
  highlightColor?: string;
  url: string;
  linkDomain?: string;
  linkTitle?: string;
  linkFavicon?: string;
  type?: string;
  imageUrl?: string;
  isPrivate?: boolean;
  createdAt: string;
  reactionCounts?: Record<string, number>;
  myReaction?: string;
  user: {
    id: number;
    username: string;
    firstName?: string;
    lastName?: string;
    profilePicture?: string;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function hexToRgb(hex: string) {
  const h = hex?.startsWith('#') && hex.length === 7 ? hex : '#A8D5B5';
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function initials(user: LandingAnnotation['user']): string {
  if (user.firstName && user.lastName)
    return (user.firstName[0] + user.lastName[0]).toUpperCase();
  return user.username.slice(0, 2).toUpperCase();
}

// ── Fake fallback data ─────────────────────────────────────────────────────────

const FAKE_ANNOTATIONS: LandingAnnotation[] = [
  {
    id: -1,
    quoteText:
      'The illiterate of the 21st century will not be those who cannot read and write, but those who cannot learn, unlearn, and relearn.',
    text: 'This hits differently in the age of AI. The skill is now meta-learning, and most people have no idea.',
    highlightColor: '#6EB781',
    url: 'https://example.com',
    linkDomain: 'fs.blog',
    linkTitle: 'The Most Important Skill Nobody Taught You',
    isPrivate: false,
    createdAt: new Date().toISOString(),
    user: { id: -1, username: 'ada' },
  },
  {
    id: -2,
    quoteText:
      'We shape our tools, and thereafter our tools shape us.',
    text: 'McLuhan wrote this about TV. Now we\'re living it with LLMs. The tools are shaping our cognition faster than we can study them.',
    highlightColor: '#E8C547',
    url: 'https://example.com',
    linkDomain: 'medium.com',
    linkTitle: 'McLuhan Was Right: How Technology Shapes Thought',
    isPrivate: false,
    createdAt: new Date().toISOString(),
    user: { id: -2, username: 'theo' },
  },
  {
    id: -3,
    quoteText:
      'Attention is the rarest and purest form of generosity.',
    text: 'Simone Weil said this in 1942. In 2024, attention is also the scarcest resource in the economy. Wild how that happened.',
    highlightColor: '#47A3E8',
    url: 'https://example.com',
    linkDomain: 'aeon.co',
    linkTitle: 'The Philosophy of Attention',
    isPrivate: false,
    createdAt: new Date().toISOString(),
    user: { id: -3, username: 'miriam' },
  },
  {
    id: -4,
    quoteText:
      'The internet is a copy machine. At its most basic level, it copies every action, every click, every post.',
    text: 'Kevin Kelly wrote this in 2008 and it aged into a prophecy. Now LLMs train on all those copies. The loop is complete.',
    highlightColor: '#E87347',
    url: 'https://example.com',
    linkDomain: 'kk.org',
    linkTitle: 'Better Than Free — Kevin Kelly',
    isPrivate: false,
    createdAt: new Date().toISOString(),
    user: { id: -4, username: 'jay' },
  },
  {
    id: -5,
    quoteText:
      'You are what you do, not what you say you\'ll do.',
    text: 'Been thinking about this a lot lately. There\'s a version of productivity culture that is entirely performance. This cuts right through it.',
    highlightColor: '#9B6EB7',
    url: 'https://example.com',
    linkDomain: 'paulgraham.com',
    linkTitle: 'Keep Your Identity Small',
    isPrivate: false,
    createdAt: new Date().toISOString(),
    user: { id: -5, username: 'zara' },
  },
  {
    id: -6,
    quoteText:
      'A complex system that works is invariably found to have evolved from a simple system that worked.',
    text: 'Gall\'s Law. Every time I ignore this principle starting a project, I pay for it. Every time I follow it, things work.',
    highlightColor: '#E8477A',
    url: 'https://example.com',
    linkDomain: 'wikipedia.org',
    linkTitle: 'Gall\'s Law — Systemantics',
    isPrivate: false,
    createdAt: new Date().toISOString(),
    user: { id: -6, username: 'ben' },
  },
];

// ── Carousel Card ──────────────────────────────────────────────────────────────

const CARD_WIDTH = 340;
const CARD_HEIGHT = 300;

const CarouselCard: React.FC<{ annotation: LandingAnnotation; isFake: boolean }> = ({
  annotation,
  isFake,
}) => {
  const { r, g, b } = hexToRgb(annotation.highlightColor || '#A8D5B5');
  const accentColor = annotation.highlightColor || '#A8D5B5';
  const domain = annotation.linkDomain || getDomain(annotation.url);
  const isImage = annotation.type === 'image' && annotation.imageUrl;

  const avatarEl = annotation.user.profilePicture ? (
    <img
      src={annotation.user.profilePicture}
      alt={annotation.user.username}
      style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
    />
  ) : (
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: `rgba(${r},${g},${b},0.15)`,
        border: `1px solid rgba(${r},${g},${b},0.3)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        fontWeight: 700,
        color: accentColor,
        flexShrink: 0,
      }}
    >
      {initials(annotation.user)}
    </div>
  );

  const inner = (
    <div
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        flexShrink: 0,
        background: '#141414',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        cursor: isFake ? 'default' : 'pointer',
        transition: 'border-color 0.2s',
        userSelect: 'none',
        boxSizing: 'border-box',
      }}
      onMouseEnter={(e) => {
        if (!isFake) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.18)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.07)';
      }}
    >
      {/* Screenshot — shown at top for image annotations */}
      {isImage && (
        <div style={{ height: 140, flexShrink: 0, overflow: 'hidden', background: '#0a0a0a' }}>
          <img
            src={annotation.imageUrl}
            alt="Screenshot"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, padding: '16px 18px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

        {/* Quote — takes up all remaining vertical space */}
        {!isImage && annotation.quoteText && (
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 14,
              color: '#d4d4d4',
              lineHeight: 1.75,
              fontStyle: 'italic',
              flex: 1,
              minHeight: 0,
              display: '-webkit-box',
              WebkitLineClamp: 5,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            <mark
              style={{
                background: `rgba(${r},${g},${b},0.22)`,
                color: 'inherit',
                borderRadius: 2,
                padding: '1px 0',
                boxDecorationBreak: 'clone',
                WebkitBoxDecorationBreak: 'clone',
              } as React.CSSProperties}
            >
              {annotation.quoteText}
            </mark>
          </p>
        )}

        {/* Note */}
        {annotation.text && (
          <p
            style={{
              fontSize: 12,
              color: '#666',
              lineHeight: 1.6,
              margin: isImage ? '0 0 12px' : '0 0 14px',
              display: '-webkit-box',
              WebkitLineClamp: isImage ? 4 : 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <MentionText text={annotation.text} />
          </p>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', flexShrink: 0 }}>
          {avatarEl}
          <span style={{ fontSize: 11, fontWeight: 600, color: '#4a4a4a', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            @{annotation.user.username}
          </span>
          {/* Source */}
          {(annotation.linkFavicon || domain) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {annotation.linkFavicon && (
                <img src={annotation.linkFavicon} alt="" style={{ width: 11, height: 11, borderRadius: 2, opacity: 0.5 }} />
              )}
              <span style={{ fontSize: 10, color: '#333', maxWidth: 100, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {domain}
              </span>
            </div>
          )}
          {/* Highlight color dot */}
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: accentColor, flexShrink: 0, opacity: 0.75 }} />
        </div>
        {/* Reactions — read-only on Landing (visitors aren't authed). Hidden when none. */}
        {annotation.reactionCounts && Object.keys(annotation.reactionCounts).length > 0 && (
          <div style={{ marginTop: 8 }}>
            <ReactionStrip
              annotationId={annotation.id}
              reactionCounts={annotation.reactionCounts}
              myReaction={annotation.myReaction}
              canReact={false}
            />
          </div>
        )}
      </div>
    </div>
  );

  if (isFake) return <div data-carousel-card="" style={{ flexShrink: 0 }}>{inner}</div>;

  return (
    <a data-carousel-card="" href={`/annotation/${annotation.id}`} style={{ textDecoration: 'none', display: 'block', flexShrink: 0 }}>
      {inner}
    </a>
  );
};


// ── Main Component ─────────────────────────────────────────────────────────────

const Landing: React.FC = () => {
  const { login } = useAuth();
  const brandFont = { fontFamily: '"Outfit", sans-serif' };

  const [carouselItems, setCarouselItems] = useState<LandingAnnotation[]>([]);
  const [isFake, setIsFake] = useState(false);
  const [carouselLoading, setCarouselLoading] = useState(true);
  const trackRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const pausedRef = useRef(false);

  // Fetch public annotations for carousel
  useEffect(() => {
    let cancelled = false;
    api
      .get('/feed?type=global&limit=20&offset=0')
      .then((res) => {
        if (cancelled) return;
        const items: LandingAnnotation[] = (res.data.annotations || res.data || []).filter(
          (a: LandingAnnotation) =>
            !a.isPrivate &&
            a.text &&
            (a.quoteText || (a.type === 'image' && a.imageUrl)),
        );
        if (items.length >= 3) {
          setCarouselItems(items);
          setIsFake(false);
        } else {
          setCarouselItems(FAKE_ANNOTATIONS);
          setIsFake(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCarouselItems(FAKE_ANNOTATIONS);
          setIsFake(true);
        }
      })
      .finally(() => {
        if (!cancelled) setCarouselLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-scroll carousel with parabolic arc
  useEffect(() => {
    if (carouselLoading || carouselItems.length === 0) return;
    const track = trackRef.current;
    if (!track) return;

    let pos = 0;
    const SPEED = 0.5;
    const ARC = 90; // max px lift at screen edges

    const applyArc = () => {
      const cx = window.innerWidth / 2;
      const half = window.innerWidth / 2;
      track.querySelectorAll<HTMLElement>('[data-carousel-card]').forEach((card) => {
        const r = card.getBoundingClientRect();
        const cardCx = r.left + r.width / 2;
        const t = (cardCx - cx) / half; // -1..1 approx
        card.style.transform = `translateY(${-(ARC * t * t)}px)`;
      });
    };

    const tick = () => {
      if (!pausedRef.current && track) {
        pos += SPEED;
        if (pos >= track.scrollWidth / 2) pos = 0;
        track.style.transform = `translateX(-${pos}px)`;
        applyArc();
      }
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [carouselLoading, carouselItems]);

  const displayItems = [...carouselItems, ...carouselItems]; // duplicate for seamless loop

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        fontFamily: '"Inter", sans-serif',
        background: '#0e0e0e',
        color: '#fff',
        overflowX: 'hidden',
      }}
    >
      {/* ── Navigation ── */}
      <Navbar />

      {/* ── Hero ── */}
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '80px 24px 16px',
        }}
      >
        {/* Logo + wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{ width: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', overflow: 'visible' }}>
            <svg width="48" height="48" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: 4, flexShrink: 0 }}>
              <circle cx="28" cy="10" r="5" fill="#E8C547" />
              <circle cx="42" cy="18" r="5" fill="#E87347" />
              <circle cx="44" cy="34" r="5" fill="#6EB781" />
              <circle cx="34" cy="46" r="5" fill="#47A3E8" />
              <circle cx="18" cy="44" r="5" fill="#9B6EB7" />
              <circle cx="12" cy="28" r="5" fill="#E8477A" />
              <circle cx="18" cy="16" r="5" fill="#47E8C5" />
              <circle cx="30" cy="28" r="3.5" fill="#6EB781" />
            </svg>
          </div>
          <span style={{ ...brandFont, fontSize: 66, fontWeight: 700, letterSpacing: '-3px', lineHeight: 1, color: '#6EB781' }}>
            scholic
          </span>
        </div>

        <h2 style={{ ...brandFont, fontSize: 22, fontWeight: 500, color: '#e0e0e0', letterSpacing: '0.2px', marginBottom: 14, margin: '0 0 14px' }}>
          A Social Annotation Platform.
        </h2>

        <p style={{ fontSize: 16, color: '#888', maxWidth: 560, lineHeight: 1.7, margin: '0 0 36px' }}>
          Highlight any passage on the web, share your perspective, and discover
          what others are thinking. Scholic turns every page into a conversation
          and every reader into a collaborator.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={login}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#6EB781',
              color: '#e0e0e0',
              padding: '11px 28px',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Get Started
            <ChevronRight size={16} />
          </button>
          <a
            href="https://chromewebstore.google.com/detail/scholic/ifclgaggdfhkikngibajdloglpaplkda"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#ddd',
              padding: '11px 28px',
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 10,
              background: 'transparent',
              textDecoration: 'none',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill="#EA4335" d="M24 11c5.2 0 9.5 3.3 11 8h12.5C45 8.3 35.5 0 24 0 14.8 0 6.9 5.3 3.1 13l6.4 11.2c1.3-7.4 7.7-13.2 14.5-13.2z"/>
              <path fill="#FBBC05" d="M11.3 24l-6.4-11.2C1.8 16.3 0 20 0 24c0 11.1 7.5 20.4 17.7 23.1l6.4-11.2c-7.3-.6-12.8-6.1-12.8-11.9z"/>
              <path fill="#34A853" d="M24 37c-5.2 0-9.5-3.3-11-8L6.6 40.2C10.4 44.9 16.8 48 24 48c11.1 0 20.4-7.5 23.1-17.7H34.5c-1.3 3.8-5 6.7-10.5 6.7z"/>
              <circle fill="#FFF" cx="24" cy="24" r="12"/>
              <circle fill="#4285F4" cx="24" cy="24" r="9"/>
            </svg>
            Add to Chrome
          </a>
        </div>
      </section>

      {/* ── Annotation Carousel ── */}
      <section style={{ paddingBottom: 80, overflow: 'hidden' }}>
        {carouselLoading ? (
          <div style={{ display: 'flex', gap: 16, padding: '0 40px' }}>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                  borderRadius: 12,
                  background: '#161616',
                  border: '1px solid rgba(255,255,255,0.06)',
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        ) : (
          <div
            style={{ overflow: 'hidden', position: 'relative' }}
            onMouseEnter={() => { pausedRef.current = true; }}
            onMouseLeave={() => { pausedRef.current = false; }}
          >
            {/* Fade edges */}
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 100, background: 'linear-gradient(to right, #0e0e0e, transparent)', zIndex: 2, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 100, background: 'linear-gradient(to left, #0e0e0e, transparent)', zIndex: 2, pointerEvents: 'none' }} />

            <div
              ref={trackRef}
              style={{ display: 'flex', gap: 20, padding: '100px 40px 30px', willChange: 'transform', alignItems: 'flex-end' }}
            >
              {displayItems.map((ann, idx) => (
                <CarouselCard key={`${ann.id}-${idx}`} annotation={ann} isFake={isFake} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Why Section ── */}
      <section style={{ padding: '80px 40px', maxWidth: 860, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>
        <p style={{ ...brandFont, fontSize: 34, fontWeight: 700, color: '#e0e0e0', letterSpacing: '-1px', lineHeight: 1.2, margin: '0 0 64px' }}>
          The best thinkers don't just read.{' '}
          <span style={{ color: '#6EB781' }}>They write back.</span>
        </p>

        {[
          {
            num: '01',
            color: '#6EB781',
            title: 'Active reading is real learning.',
            body: 'Highlighting forces one decision: is this worth keeping? A note forces another: why? That loop — decide, articulate, connect — is how ideas move from the page into your head for good.',
          },
          {
            num: '02',
            color: '#E8C547',
            title: 'Your reading trail should follow you.',
            body: 'Notes in the margin of a physical book are permanent. On the web, they vanish the moment you close the tab. Scholic makes them stick — searchable, linked to the source, always yours.',
          },
          {
            num: '03',
            color: '#47A3E8',
            title: 'Other people\'s lens on the same text is gold.',
            body: 'A biologist and a philosopher reading the same paper will annotate completely different things. Seeing what the person next to you highlighted — and why — doubles what you get from anything.',
          },
        ].map((item) => (
          <div
            key={item.num}
            style={{
              borderTop: '1px solid rgba(255,255,255,0.06)',
              padding: '28px 0',
              display: 'grid',
              gridTemplateColumns: '52px 1fr',
              gap: 28,
              alignItems: 'start',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: item.color, letterSpacing: '0.05em', paddingTop: 3 }}>
              {item.num}
            </span>
            <div>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#ddd', margin: '0 0 8px', lineHeight: 1.3 }}>{item.title}</p>
              <p style={{ fontSize: 14, color: '#666', lineHeight: 1.75, margin: 0 }}>{item.body}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ── How to start ── */}
      <section style={{ padding: '0 40px 100px', maxWidth: 860, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>
        <p style={{ ...brandFont, fontSize: 34, fontWeight: 700, color: '#e0e0e0', letterSpacing: '-1px', lineHeight: 1.2, margin: '0 0 64px' }}>
          Up and running{' '}
          <span style={{ color: '#6EB781' }}>in two minutes.</span>
        </p>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[
            {
              num: '1',
              color: '#6EB781',
              title: 'Create an account',
              body: 'Sign up with Google — one click, no form. Your profile is live immediately and your annotations are public by default, private if you choose.',
            },
            {
              num: '2',
              color: '#E8C547',
              title: 'Add the Chrome extension',
              body: 'Install from the Chrome Web Store in 30 seconds. Works on every site: news, research papers, PDFs, blogs. Anything with a URL.',
            },
            {
              num: '3',
              color: '#47A3E8',
              title: 'Pin it. Select text. Start annotating.',
              body: 'Pin the extension so it\'s one click away. Then select any text on any page — a popup appears. Add a note, pick a color, save. Done.',
            },
          ].map((step, i, arr) => (
            <div key={step.num} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: 28, alignItems: 'stretch' }}>
              {/* Left: number badge + connecting line */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: `${step.color}18`,
                    border: `1px solid ${step.color}44`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 700,
                    color: step.color,
                    flexShrink: 0,
                  }}
                >
                  {step.num}
                </div>
                {i < arr.length - 1 && (
                  <div style={{ width: 1, flex: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />
                )}
              </div>

              {/* Right: content */}
              <div style={{ paddingBottom: i < arr.length - 1 ? 36 : 0, paddingTop: 6 }}>
                <p style={{ fontSize: 16, fontWeight: 600, color: '#ddd', margin: '0 0 8px', lineHeight: 1.3 }}>{step.title}</p>
                <p style={{ fontSize: 14, color: '#666', lineHeight: 1.75, margin: 0 }}>{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 52 }}>
          <button
            onClick={login}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              backgroundColor: '#6EB781', color: '#e0e0e0',
              padding: '11px 28px', fontSize: 14, fontWeight: 600,
              borderRadius: 10, border: 'none', cursor: 'pointer',
            }}
          >
            Create account
            <ChevronRight size={15} />
          </button>
          <a
            href="https://chromewebstore.google.com/detail/scholic/ifclgaggdfhkikngibajdloglpaplkda"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              border: '1px solid rgba(255,255,255,0.12)', color: '#bbb',
              padding: '11px 28px', fontSize: 14, fontWeight: 500,
              borderRadius: 10, background: 'transparent', textDecoration: 'none',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill="#EA4335" d="M24 11c5.2 0 9.5 3.3 11 8h12.5C45 8.3 35.5 0 24 0 14.8 0 6.9 5.3 3.1 13l6.4 11.2c1.3-7.4 7.7-13.2 14.5-13.2z"/>
              <path fill="#FBBC05" d="M11.3 24l-6.4-11.2C1.8 16.3 0 20 0 24c0 11.1 7.5 20.4 17.7 23.1l6.4-11.2c-7.3-.6-12.8-6.1-12.8-11.9z"/>
              <path fill="#34A853" d="M24 37c-5.2 0-9.5-3.3-11-8L6.6 40.2C10.4 44.9 16.8 48 24 48c11.1 0 20.4-7.5 23.1-17.7H34.5c-1.3 3.8-5 6.7-10.5 6.7z"/>
              <circle fill="#FFF" cx="24" cy="24" r="12"/>
              <circle fill="#4285F4" cx="24" cy="24" r="9"/>
            </svg>
            Get the extension
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: '24px 40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <span style={{ ...brandFont, fontSize: 15, fontWeight: 600, color: '#444' }}>
          <span style={{ color: '#6EB781' }}>#</span>scholic
        </span>
        <span style={{ fontSize: 12, color: '#333' }}>
          © {new Date().getFullYear()} Scholic
        </span>
      </footer>
    </div>
  );
};

export default Landing;
