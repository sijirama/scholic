import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TrendingUp, Globe, UserPlus, BookmarkCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import type { Annotation } from '../components/AnnotationCard';
import Avatar from '../components/Avatar';
import UrlCard from '../components/discover/UrlCard';
import type { TrendingPage } from '../components/discover/UrlCard';
import UserCard from '../components/discover/UserCard';
import type { DiscoverAuthor } from '../components/discover/UserCard';
import Marquee from '../components/discover/Marquee';
import DiscoverAnnotationCard from '../components/discover/DiscoverAnnotationCard';
import MentionText from '../components/MentionText';

interface DiscoverResponse {
  trendingAnnotations: Annotation[];
  trendingPages: TrendingPage[];
  peopleToFollow: DiscoverAuthor[];
  onPagesYouveRead: Annotation[];
  lastRefresh: number;
}

const SectionHeader: React.FC<{
  index: number;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  accent: string;
}> = ({ index, title, subtitle, icon, accent }) => {
  const brandFont = { fontFamily: '"Outfit", sans-serif' };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
      <div
        style={{
          width: 36, height: 36, borderRadius: 10,
          background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 20%, transparent), color-mix(in srgb, ${accent} 7%, transparent))`,
          border: `1px solid color-mix(in srgb, ${accent} 33%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: accent, flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-faint)', letterSpacing: 0.5 }}>
            {String(index).padStart(2, '0')}
          </span>
          <h2 style={{ ...brandFont, fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{title}</h2>
        </div>
        {subtitle && (
          <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '2px 0 0' }}>{subtitle}</p>
        )}
      </div>
    </div>
  );
};

const Discover: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DiscoverResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const bodyFont = { fontFamily: '"Inter", sans-serif' };
  const brandFont = { fontFamily: '"Outfit", sans-serif' };

  useEffect(() => {
    let cancelled = false;
    api.get<DiscoverResponse>('/discover')
      .then(r => { if (!cancelled) { setData(r.data); setErr(false); } })
      .catch(() => { if (!cancelled) setErr(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const featured = useMemo(() => {
    if (!data?.trendingAnnotations?.length) return null;
    // Pick the first annotation that has a quote — better visual.
    return data.trendingAnnotations.find(a => a.quoteText?.trim()) || null;
  }, [data]);

  const restTrending = useMemo(() => {
    if (!data?.trendingAnnotations) return [];
    if (!featured) return data.trendingAnnotations;
    return data.trendingAnnotations.filter(a => a.id !== featured.id);
  }, [data, featured]);

  const shouldMarqueePeople = (data?.peopleToFollow?.length || 0) > 3;

  const renderAnnotationGrid = (anns: Annotation[]) => (
    <div className="discover-masonry">
      {anns.map((a, i) => (
        <motion.div
          key={a.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="discover-masonry-item"
        >
          <DiscoverAnnotationCard annotation={a} canReact={!!user} />
        </motion.div>
      ))}
    </div>
  );

  return (
    <div className="theme-page" style={{ ...bodyFont, overflowX: 'hidden' }}>
      <Navbar />

      {/* Decorative background gradient */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 48, left: 0, right: 0, height: 480,
          background: 'radial-gradient(ellipse at 50% 0%, var(--accent-soft), transparent 60%)',
          pointerEvents: 'none', zIndex: 0,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1280, padding: '40px 24px 80px', margin: '0 auto' }}>
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ marginBottom: 40 }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', marginBottom: 14 }}>
            <Sparkles style={{ width: 12, height: 12, color: 'var(--accent)' }} />
            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, letterSpacing: 0.3 }}>DISCOVER</span>
          </div>
          <h1 style={{ ...brandFont, fontSize: 36, fontWeight: 700, margin: 0, lineHeight: 1.1, letterSpacing: -0.5 }}>
            What the community is <span style={{ color: 'var(--accent)' }}>reading</span>
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-dim)', margin: '10px 0 0', maxWidth: 540 }}>
            Trending highlights, buzzing pages, and scholars worth following — refreshed every few hours.
          </p>
        </motion.div>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ height: 220, background: 'var(--surface-inset)', borderRadius: 12 }} className="discover-pulse" />
            ))}
          </div>
        )}

        {!loading && err && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-dim)' }}>
            <p style={{ fontSize: 14, marginBottom: 16 }}>Failed to load Discover</p>
            <button
              onClick={() => window.location.reload()}
              className="theme-pill"
              style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !err && data && (
          <>
            {/* Featured trending highlight */}
            {featured && featured.quoteText && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, duration: 0.4 }}
                onClick={() => navigate(`/annotation/${featured.id}`)}
                style={{
                  position: 'relative',
                  marginBottom: 56,
                  padding: '36px 40px',
                  background: 'linear-gradient(135deg, var(--accent-soft), var(--color-blue-soft))',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  cursor: 'pointer',
                  overflow: 'hidden',
                }}
                whileHover={{ borderColor: 'var(--accent-border)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: 11, color: 'var(--accent)', fontWeight: 600, letterSpacing: 0.5 }}>
                  <TrendingUp style={{ width: 12, height: 12 }} />
                  <span>FEATURED HIGHLIGHT</span>
                </div>
                <blockquote style={{
                  ...brandFont,
                  fontSize: 22,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  color: 'var(--text)',
                  margin: '0 0 20px',
                  display: '-webkit-box',
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  position: 'relative',
                  paddingLeft: 20,
                  borderLeft: '3px solid var(--accent)',
                }}>
                  "{featured.quoteText}"
                </blockquote>
                {featured.text && (
                  <p style={{ fontSize: 14, color: 'var(--text-soft)', margin: '0 0 20px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    <MentionText text={featured.text} />
                  </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar user={featured.user} size={28} />
                  <span style={{ fontSize: 13, color: 'var(--text-soft)', fontWeight: 500 }}>@{featured.user.username}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>·</span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    on {(() => { try { return featured.linkDomain || new URL(featured.url).hostname.replace('www.', ''); } catch { return 'site'; } })()}
                  </span>
                </div>
              </motion.section>
            )}

            {/* Pages getting buzz — marquee */}
            {data.trendingPages?.length > 0 && (
              <section style={{ marginBottom: 56 }}>
                <div style={{ padding: '0 0' }}>
                  <SectionHeader
                    index={1}
                    title="Pages getting buzz"
                    subtitle="Where the conversation is heating up"
                    icon={<Globe style={{ width: 16, height: 16 }} />}
                    accent="var(--color-blue)"
                  />
                </div>
                <Marquee speed={0.4}>
                  {data.trendingPages.map(p => <UrlCard key={p.url} page={p} />)}
                </Marquee>
              </section>
            )}

            {/* People to follow — marquee */}
            {data.peopleToFollow?.length > 0 && (
              <section style={{ marginBottom: 56 }}>
                <SectionHeader
                  index={2}
                  title="Scholars to follow"
                  subtitle="Active voices worth a tap"
                  icon={<UserPlus style={{ width: 16, height: 16 }} />}
                  accent="var(--color-yellow)"
                />
                {shouldMarqueePeople ? (
                  <Marquee speed={0.35} direction="right" staticAlign="left" breakout={false}>
                    {data.peopleToFollow.map(p => (
                      <UserCard key={p.id} user={p} currentUserId={user?.id} isAuthed={!!user} />
                    ))}
                  </Marquee>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-start',
                      gap: 14,
                      flexWrap: 'wrap',
                      paddingTop: 4,
                    }}
                  >
                    {data.peopleToFollow.map(p => (
                      <UserCard key={p.id} user={p} currentUserId={user?.id} isAuthed={!!user} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Trending annotations */}
            {restTrending.length > 0 && (
              <section style={{ marginBottom: 56 }}>
                <SectionHeader
                  index={3}
                  title="Trending annotations"
                  subtitle="Most reacted-to highlights from the community"
                  icon={<TrendingUp style={{ width: 16, height: 16 }} />}
                  accent="var(--accent)"
                />
                {renderAnnotationGrid(restTrending)}
              </section>
            )}

            {/* On pages you've read */}
            {user && data.onPagesYouveRead?.length > 0 && (
              <section style={{ marginBottom: 56 }}>
                <SectionHeader
                  index={4}
                  title="On pages you've read"
                  subtitle="What others are saying about your annotated pages"
                  icon={<BookmarkCheck style={{ width: 16, height: 16 }} />}
                  accent="var(--color-purple-strong)"
                />
                {renderAnnotationGrid(data.onPagesYouveRead)}
              </section>
            )}

            {data.trendingAnnotations.length === 0 &&
              data.trendingPages.length === 0 &&
              data.peopleToFollow.length === 0 &&
              data.onPagesYouveRead.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-dim)' }}>
                  <p style={{ fontSize: 14 }}>Nothing to discover just yet — check back soon.</p>
                </div>
              )}
          </>
        )}
      </div>

      <style>{`
        @keyframes discoverPulse {
          0% { opacity: 0.4; }
          50% { opacity: 0.7; }
          100% { opacity: 0.4; }
        }
        .discover-pulse { animation: discoverPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

        .discover-masonry {
          column-count: 3;
          column-gap: 28px;
        }
        .discover-masonry-item {
          break-inside: avoid;
          margin-bottom: 28px;
        }

        @media (max-width: 1120px) {
          .discover-masonry {
            column-count: 2;
          }
        }

        @media (max-width: 720px) {
          .discover-masonry {
            column-count: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default Discover;
