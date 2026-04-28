import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import SiteAnnotationCard from '../components/SiteAnnotationCard';
import api from '../lib/api';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { Annotation } from '../components/AnnotationCard';

function hexToRgba(hex: string, alpha: number): string {
  const h = hex && hex.startsWith('#') && hex.length === 7 ? hex : '#A8D5B5';
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Extract the TextPositionSelector start offset to order quotes by document position
function getTextPosition(selectorsJson: string | undefined): number {
  if (!selectorsJson) return Infinity;
  try {
    const selectors = JSON.parse(selectorsJson);
    const pos = selectors.find((s: { type: string; start?: number }) => s.type === 'TextPositionSelector');
    return pos?.start ?? Infinity;
  } catch {
    return Infinity;
  }
}

// Show a "···" gap indicator if two consecutive quotes are far apart in the document
function hasSignificantGap(pos1: number, pos2: number): boolean {
  if (pos1 === Infinity || pos2 === Infinity) return false;
  return pos2 - pos1 > 600;
}

const TIME_RANGE_OPTIONS = [
  { label: 'All time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'This week', value: 'week' },
  { label: 'This month', value: 'month' },
];

const PaperSkeleton: React.FC = () => (
  <div style={{ background: '#f9f6f0', borderRadius: '3px 8px 8px 3px', overflow: 'hidden', display: 'flex', boxShadow: '0 2px 8px rgba(0,0,0,0.2), 0 12px 48px rgba(0,0,0,0.4)' }}>
    <div style={{ width: 4, background: 'rgba(220,100,100,0.4)', flexShrink: 0 }} />
    <div style={{ flex: 1, padding: '28px 28px 28px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {[1, 2, 3].map(i => (
        <div key={i}>
          <div style={{ height: 14, borderRadius: 3, background: 'rgba(0,0,0,0.06)', marginBottom: 8, width: '95%' }} />
          <div style={{ height: 14, borderRadius: 3, background: 'rgba(0,0,0,0.06)', marginBottom: 8, width: '80%' }} />
          <div style={{ height: 12, borderRadius: 3, background: 'rgba(0,0,0,0.04)', width: '40%' }} />
        </div>
      ))}
    </div>
  </div>
);

const SitePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: currentUser } = useAuth();

  const siteUrl = searchParams.get('url') || '';
  const authorParams = searchParams.getAll('author');
  const timeRangeParam = searchParams.get('timeRange') || 'all';

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [availableAuthors, setAvailableAuthors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state (mirrors URL params)
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>(authorParams);
  const [timeRange, setTimeRange] = useState(timeRangeParam);

  // Which annotation card is selected (for cross-panel sync)
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Refs for paper quote blocks — keyed by annotation id
  const quoteRefs = useRef<Record<number, HTMLDivElement | null>>({});
  // Ref for right panel cards
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const bodyFont = { fontFamily: '"Inter", sans-serif' };

  const fetchSite = useCallback(async () => {
    if (!siteUrl) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ url: siteUrl, timeRange });
      selectedAuthors.forEach(a => params.append('author', a));
      const response = await api.get(`/site?${params.toString()}`);
      setAnnotations(response.data.annotations || []);
      setAvailableAuthors(response.data.authors || []);
    } catch {
      toast.error('Failed to load site annotations');
    } finally {
      setLoading(false);
    }
  }, [siteUrl, selectedAuthors, timeRange]);

  useEffect(() => {
    fetchSite();
  }, [fetchSite]);

  // Sync filter changes to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (siteUrl) params.set('url', siteUrl);
    if (timeRange !== 'all') params.set('timeRange', timeRange);
    selectedAuthors.forEach(a => params.append('author', a));
    setSearchParams(params, { replace: true });
  }, [selectedAuthors, timeRange, siteUrl, setSearchParams]);

  // Sort annotations by document position (TextPositionSelector.start)
  const sortedAnnotations = useMemo(() => {
    return [...annotations].sort((a, b) => getTextPosition(a.selectors) - getTextPosition(b.selectors));
  }, [annotations]);

  // Get link metadata from the first annotation that has it
  const linkMeta = useMemo(() => {
    return annotations.find(a => a.linkTitle || a.linkDomain || a.linkFavicon) || null;
  }, [annotations]);

  const domainName = useMemo(() => {
    if (linkMeta?.linkDomain) return linkMeta.linkDomain;
    try { return new URL(siteUrl).hostname.replace('www.', ''); } catch { return siteUrl; }
  }, [linkMeta, siteUrl]);

  const handleSelectAnnotation = (annotation: Annotation) => {
    const id = annotation.id;
    setSelectedId(id);
    // Scroll the paper panel to that quote
    quoteRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleSelectQuote = (annotation: Annotation) => {
    const id = annotation.id;
    setSelectedId(id);
    // Scroll the right panel to that card
    cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const toggleAuthor = (username: string) => {
    setSelectedAuthors(prev =>
      prev.includes(username) ? prev.filter(a => a !== username) : [...prev, username]
    );
  };

  if (!siteUrl) {
    return (
      <div style={{ ...bodyFont, minHeight: '100vh', background: '#121212', color: '#fff' }}>
        <Navbar />
        <div style={{ maxWidth: 640, padding: '60px 20px', margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: '#555' }}>No URL specified. Navigate here by clicking a domain name on any annotation.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...bodyFont, minHeight: '100vh', background: '#121212', color: '#fff' }}>
      <Navbar />

      <div style={{ maxWidth: 1280, padding: '32px 24px', margin: '0 auto' }}>
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#555', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 24, fontFamily: 'inherit', transition: 'color 0.15s' }}
          className="hover:text-white"
        >
          <ArrowLeft style={{ width: 15, height: 15 }} />
          Back
        </button>

        {/* Page header — link preview */}
        <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 14 }}>
          {linkMeta?.linkFavicon && (
            <img src={linkMeta.linkFavicon} style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0 }} alt="" />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: '"Outfit", sans-serif', fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {linkMeta?.linkTitle || domainName}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#555' }}>{domainName}</span>
              <span style={{ fontSize: 12, color: '#333' }}>·</span>
              <span style={{ fontSize: 12, color: '#555' }}>{annotations.length} annotation{annotations.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <a
            href={siteUrl}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#555', textDecoration: 'none', flexShrink: 0, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', transition: 'all 0.15s' }}
            className="hover:text-white hover:border-white/20"
          >
            <ExternalLink style={{ width: 13, height: 13 }} />
            Visit site
          </a>
        </div>

        {/* Split layout */}
        <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>

          {/* LEFT — paper document */}
          <div style={{ flex: '0 0 56%', position: 'sticky', top: 80, maxHeight: 'calc(100vh - 112px)', overflowY: 'auto', scrollbarWidth: 'thin' }}>
            {loading ? (
              <PaperSkeleton />
            ) : sortedAnnotations.length === 0 ? (
              <div style={{ background: '#f9f6f0', borderRadius: '3px 8px 8px 3px', overflow: 'hidden', display: 'flex', boxShadow: '0 2px 8px rgba(0,0,0,0.2), 0 12px 48px rgba(0,0,0,0.4)' }}>
                <div style={{ width: 4, background: 'rgba(220,100,100,0.4)', flexShrink: 0 }} />
                <div style={{ flex: 1, padding: '40px 28px', textAlign: 'center', color: 'rgba(0,0,0,0.3)', fontSize: 13 }}>
                  No annotations match the current filters
                </div>
              </div>
            ) : (
              <div style={{ background: '#f9f6f0', borderRadius: '3px 8px 8px 3px', overflow: 'hidden', display: 'flex', boxShadow: '0 2px 8px rgba(0,0,0,0.2), 0 12px 48px rgba(0,0,0,0.4)' }}>
                {/* Red margin line */}
                <div style={{ width: 4, background: 'rgba(220,100,100,0.45)', flexShrink: 0 }} />

                {/* Paper content */}
                <div style={{ flex: 1, padding: '16px 16px 16px 12px' }}>
                  {sortedAnnotations.map((annotation, index) => {
                    const prev = sortedAnnotations[index - 1];
                    const showGap = prev && hasSignificantGap(
                      getTextPosition(prev.selectors),
                      getTextPosition(annotation.selectors)
                    );
                    const isSelected = selectedId === annotation.id;
                    const anySelected = selectedId !== null;

                    return (
                      <React.Fragment key={annotation.id}>
                        {showGap && (
                          <div style={{ textAlign: 'center', color: 'rgba(0,0,0,0.18)', fontSize: 18, padding: '8px 0', letterSpacing: 6, userSelect: 'none', opacity: anySelected && !isSelected ? 0.3 : 1, transition: 'opacity 0.25s' }}>
                            ···
                          </div>
                        )}
                        <div
                          ref={el => { quoteRefs.current[annotation.id] = el; }}
                          onClick={() => handleSelectQuote(annotation)}
                          style={{
                            borderRadius: 4,
                            padding: '6px 8px',
                            marginBottom: 0,
                            cursor: 'pointer',
                            transition: 'opacity 0.25s',
                            opacity: anySelected && !isSelected ? 0.25 : 1,
                          }}
                        >
                          {annotation.quoteText && (
                            <p style={{
                              fontSize: 13,
                              lineHeight: 1.8,
                              color: '#1a1a1a',
                              fontFamily: '"Georgia", "Times New Roman", serif',
                              margin: 0,
                              display: '-webkit-box',
                              WebkitLineClamp: 5,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              overflowWrap: 'break-word',
                              wordBreak: 'break-word',
                            }}>
                              <mark style={{
                                background: isSelected
                                  ? hexToRgba(annotation.highlightColor || '#A8D5B5', 0.5)
                                  : hexToRgba(annotation.highlightColor || '#A8D5B5', 0.28),
                                color: 'inherit',
                                borderRadius: 2,
                                padding: '2px 1px',
                                transition: 'all 0.25s',
                                boxShadow: isSelected
                                  ? `0 0 12px ${hexToRgba(annotation.highlightColor || '#A8D5B5', 0.65)}, 0 0 28px ${hexToRgba(annotation.highlightColor || '#A8D5B5', 0.3)}`
                                  : 'none',
                              }}>
                                {annotation.quoteText}
                              </mark>
                            </p>
                          )}

                          {!annotation.quoteText && annotation.type !== 'image' && annotation.text && (
                            <p style={{
                              fontFamily: '"Caveat", cursive',
                              fontSize: 17,
                              color: isSelected ? '#2e4e38' : '#3a5c45',
                              lineHeight: 1.5,
                              margin: 0,
                              transition: 'color 0.25s',
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              overflowWrap: 'break-word',
                              wordBreak: 'break-word',
                            }}>
                              {annotation.text}
                            </p>
                          )}

                          {annotation.quoteText && annotation.text && (
                            <p style={{
                              fontFamily: '"Caveat", cursive',
                              fontSize: 17,
                              color: isSelected ? '#2e4e38' : '#3a5c45',
                              lineHeight: 1.5,
                              margin: '8px 0 0',
                              borderTop: '1px dashed rgba(0,0,0,0.1)',
                              paddingTop: 6,
                              transition: 'color 0.25s',
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              overflowWrap: 'break-word',
                              wordBreak: 'break-word',
                            }}>
                              {annotation.text}
                            </p>
                          )}

                          {annotation.type === 'image' && annotation.imageUrl && (
                            <img src={annotation.imageUrl} alt="Screenshot" style={{ width: '100%', borderRadius: 4, marginBottom: annotation.text ? 8 : 0 }} />
                          )}

                          {/* Attribution */}
                          <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(0,0,0,0.28)' }}>
                            @{annotation.user?.username}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — filters + annotation cards */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Filter bar */}
            <div style={{ marginBottom: 20 }}>
              {/* Time range */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {TIME_RANGE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTimeRange(opt.value)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 20,
                      border: `1px solid ${timeRange === opt.value ? 'rgba(110,183,129,0.5)' : 'rgba(255,255,255,0.08)'}`,
                      background: timeRange === opt.value ? 'rgba(110,183,129,0.1)' : 'rgba(255,255,255,0.02)',
                      color: timeRange === opt.value ? '#6EB781' : '#666',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Author filter */}
              {availableAuthors.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#444', fontWeight: 500 }}>Authors:</span>
                  <button
                    onClick={() => setSelectedAuthors([])}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 20,
                      border: `1px solid ${selectedAuthors.length === 0 ? 'rgba(110,183,129,0.5)' : 'rgba(255,255,255,0.08)'}`,
                      background: selectedAuthors.length === 0 ? 'rgba(110,183,129,0.1)' : 'rgba(255,255,255,0.02)',
                      color: selectedAuthors.length === 0 ? '#6EB781' : '#666',
                      fontSize: 12,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}
                  >
                    All
                  </button>
                  {availableAuthors.map(username => {
                    const active = selectedAuthors.includes(username);
                    return (
                      <button
                        key={username}
                        onClick={() => toggleAuthor(username)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 20,
                          border: `1px solid ${active ? 'rgba(110,183,129,0.5)' : 'rgba(255,255,255,0.08)'}`,
                          background: active ? 'rgba(110,183,129,0.1)' : 'rgba(255,255,255,0.02)',
                          color: active ? '#6EB781' : '#666',
                          fontSize: 12,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          transition: 'all 0.15s',
                        }}
                      >
                        @{username}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Annotation cards */}
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{ height: 100, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }} className="pulse" />
                ))}
              </div>
            ) : sortedAnnotations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#444' }}>
                <p style={{ fontSize: 14, marginBottom: 6 }}>No annotations yet</p>
                <p style={{ fontSize: 12, color: '#333' }}>
                  {selectedAuthors.length > 0 || timeRange !== 'all'
                    ? 'Try clearing some filters'
                    : 'Be the first to annotate this page with the Scholic extension!'}
                </p>
              </div>
            ) : (
              <div>
                {sortedAnnotations.map(annotation => (
                  <div key={annotation.id} ref={el => { cardRefs.current[annotation.id] = el; }}>
                    <SiteAnnotationCard
                      annotation={annotation}
                      isSelected={selectedId === annotation.id}
                      onClick={() => handleSelectAnnotation(annotation)}
                      canReact={!!currentUser}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 0.7; } 100% { opacity: 0.4; } }
        .pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        mark { -webkit-print-color-adjust: exact; }

        /* Subtle scrollbar for left panel */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>
    </div>
  );
};

export default SitePage;
