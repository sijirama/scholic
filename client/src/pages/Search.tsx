import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { FileText, Search, X } from 'lucide-react';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import ReactionStrip from '../components/ReactionStrip';
import MentionText from '../components/MentionText';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SearchAnnotation {
  id: number;
  quoteText?: string;
  text?: string;
  highlightColor?: string;
  url: string;
  linkDomain?: string;
  linkFavicon?: string;
  linkTitle?: string;
  type?: string;
  imageUrl?: string;
  createdAt: string;
  commentCount?: number;
  reactionCounts?: Record<string, number>;
  myReaction?: string;
  user: { id: number; username: string; firstName?: string; lastName?: string; profilePicture?: string };
}

interface SearchUser {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  bio?: string;
}

type TabType = 'all' | 'annotations' | 'users' | 'documents';

interface SearchDocument {
  id: number;
  title: string;
  description: string;
  authors: string[];
  tags: string[];
  publishedYear?: number;
  publisher?: string;
  pageCount?: number;
  fileUrl: string;
  fileName: string;
  createdAt: string;
  metadataSource: string;
  user: { id: number; username: string; firstName?: string; lastName?: string; profilePicture?: string };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// Colors match the extension's HIGHLIGHT_COLORS exactly
const PALETTE_COLORS = [
  { hex: '#A8D5B5', label: 'Sage' },
  { hex: '#F5E4A0', label: 'Butter' },
  { hex: '#A3C4F3', label: 'Sky' },
  { hex: '#C5A8D5', label: 'Lilac' },
  { hex: '#F5C4A3', label: 'Peach' },
  { hex: '#F5A8C0', label: 'Rose' },
  { hex: '#4A9B6F', label: 'Forest' },
  { hex: '#D4A017', label: 'Amber' },
  { hex: '#2E7BC4', label: 'Ocean' },
  { hex: '#8B4BAF', label: 'Plum' },
  { hex: '#E8603C', label: 'Coral' },
  { hex: '#C0392B', label: 'Crimson' },
];

function hexToRgb(hex: string) {
  const h = hex?.startsWith('#') && hex.length===7 ? hex : '#A8D5B5';
  return { r: parseInt(h.slice(1,3),16), g: parseInt(h.slice(3,5),16), b: parseInt(h.slice(5,7),16) };
}
function getDomain(url: string) { try { return new URL(url).hostname.replace('www.',''); } catch { return url; } }
function timeAgo(d: string) {
  const diff = Date.now()-new Date(d).getTime();
  const m = Math.floor(diff/60000);
  if(m<1) return 'just now'; if(m<60) return `${m}m ago`;
  const h=Math.floor(m/60); if(h<24) return `${h}h ago`;
  const days=Math.floor(h/24); if(days===1) return 'yesterday'; if(days<7) return `${days}d ago`;
  return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

// ── Annotation result card ─────────────────────────────────────────────────────

const AnnotationResultCard: React.FC<{ annotation: SearchAnnotation }> = ({ annotation }) => {
  const color = annotation.highlightColor || '#A8D5B5';
  const { r, g, b } = hexToRgb(color);
  const domain = annotation.linkDomain || getDomain(annotation.url);
  const isImage = annotation.type === 'image' && annotation.imageUrl;
  const initial = annotation.user.username?.[0]?.toUpperCase() || '?';
  const [hovered, setHovered] = useState(false);

  return (
    <Link to={`/annotation/${annotation.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ padding: '18px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, background: hovered ? 'rgba(255,255,255,0.03)' : 'transparent', transition: 'background 0.12s' }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {/* Avatar */}
          <Link to={`/u/${annotation.user.username}`} style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: annotation.user.profilePicture ? 'transparent' : 'linear-gradient(135deg,rgba(110,183,129,0.5),rgba(71,163,232,0.5))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden' }}>
              {annotation.user.profilePicture ? <img src={annotation.user.profilePicture} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : initial}
            </div>
          </Link>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <Link to={`/u/${annotation.user.username}`} style={{ textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#ddd' }}>@{annotation.user.username}</span>
              </Link>
              <span style={{ fontSize: 12, color: '#444' }}>{timeAgo(annotation.createdAt)}</span>
              {domain && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                  {annotation.linkFavicon && <img src={annotation.linkFavicon} alt="" style={{ width: 12, height: 12, borderRadius: 2 }} />}
                  <span style={{ fontSize: 11, color: '#444' }}>{domain}</span>
                </div>
              )}
            </div>

            {/* Screenshot */}
            {isImage && (
              <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', maxHeight: 200, marginBottom: 10 }}>
                <img src={annotation.imageUrl} alt="Screenshot" style={{ width: '100%', display: 'block', objectFit: 'cover', maxHeight: 200 }} />
              </div>
            )}

            {/* Quote */}
            {!isImage && annotation.quoteText && (
              <p style={{ margin: '0 0 8px', fontSize: 14, color: '#ccc', lineHeight: 1.7, fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                <mark style={{ background: `rgba(${r},${g},${b},0.22)`, color: 'inherit', borderRadius: 2, padding: '1px 0', boxDecorationBreak: 'clone' } as React.CSSProperties}>
                  {annotation.quoteText}
                </mark>
              </p>
            )}

            {/* Note */}
            {annotation.text && (
              <p style={{ margin: '0 0 10px', fontSize: 13, color: '#777', lineHeight: 1.65, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                <MentionText text={annotation.text} />
              </p>
            )}

            {/* Link title */}
            {annotation.linkTitle && (
              <div style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: '#555', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{annotation.linkTitle}</span>
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              {annotation.commentCount !== undefined && annotation.commentCount > 0 && (
                <span style={{ fontSize: 11, color: '#444' }}>{annotation.commentCount} comment{annotation.commentCount !== 1 ? 's' : ''}</span>
              )}
              <ReactionStrip
                annotationId={annotation.id}
                reactionCounts={annotation.reactionCounts}
                myReaction={annotation.myReaction}
                canReact={false}
              />
              <span style={{ fontSize: 11, color: hovered ? '#666' : '#444', marginLeft: 'auto', transition: 'color 0.1s' }}>View →</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
};

const UserResultCard: React.FC<{ user: SearchUser }> = ({ user }) => {
  const initial = user.username?.[0]?.toUpperCase() || '?';
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const [hovered, setHovered] = useState(false);
  return (
    <Link to={`/u/${user.username}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, background: hovered ? 'rgba(255,255,255,0.03)' : 'transparent', transition: 'background 0.12s' }}
      >
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: user.profilePicture ? 'transparent' : 'linear-gradient(135deg,rgba(110,183,129,0.5),rgba(71,163,232,0.5))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
          {user.profilePicture ? <img src={user.profilePicture} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {displayName && <div style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0' }}>{displayName}</div>}
          <div style={{ fontSize: 13, color: '#666' }}>@{user.username}</div>
          {user.bio && <div style={{ fontSize: 12, color: '#555', marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{user.bio}</div>}
        </div>
      </div>
    </Link>
  );
};

const DocumentResultCard: React.FC<{ documentRecord: SearchDocument }> = ({ documentRecord }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <Link to={`/document/${documentRecord.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ display: 'flex', gap: 12, padding: '16px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, background: hovered ? 'rgba(255,255,255,0.03)' : 'transparent', transition: 'background 0.12s' }}
      >
        <div style={{ width: 42, height: 42, borderRadius: 14, background: 'rgba(110,183,129,0.12)', border: '1px solid rgba(110,183,129,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileText style={{ width: 18, height: 18, color: '#6EB781' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#e5e5e5' }}>{documentRecord.title}</span>
            {documentRecord.publishedYear && <span style={{ fontSize: 11, color: '#555' }}>{documentRecord.publishedYear}</span>}
            <span style={{ fontSize: 11, color: '#444', marginLeft: 'auto' }}>by @{documentRecord.user.username}</span>
          </div>
          {documentRecord.authors.length > 0 && (
            <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
              {documentRecord.authors.join(', ')}
            </div>
          )}
          {documentRecord.description && (
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#777', lineHeight: 1.65, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {documentRecord.description}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {documentRecord.publisher && <span style={{ fontSize: 11, color: '#555' }}>{documentRecord.publisher}</span>}
            {documentRecord.pageCount ? <span style={{ fontSize: 11, color: '#555' }}>{documentRecord.pageCount} pages</span> : null}
            {documentRecord.tags.slice(0, 4).map((tag) => (
              <span key={tag} style={{ fontSize: 10, color: '#8cc7f0', background: 'rgba(71,163,232,0.10)', border: '1px solid rgba(71,163,232,0.18)', borderRadius: 999, padding: '3px 7px' }}>
                {tag}
              </span>
            ))}
            <span style={{ fontSize: 11, color: hovered ? '#666' : '#444', marginLeft: 'auto', transition: 'color 0.1s' }}>View →</span>
          </div>
        </div>
      </div>
    </Link>
  );
};

// ── Color chip ─────────────────────────────────────────────────────────────────

const ColorChip: React.FC<{hex:string;label:string;active:boolean;onClick:()=>void}> = ({hex,label,active,onClick}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick} title={label}
      onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
      style={{width:18,height:18,borderRadius:'50%',background:hex,
        border: active ? '2px solid #fff' : hovered ? '2px solid rgba(255,255,255,0.4)' : '2px solid transparent',
        cursor:'pointer',padding:0,outline: active ? `2px solid ${hex}` : 'none',outlineOffset:1,
        transition:'all 0.12s',transform: hovered || active ? 'scale(1.18)' : 'scale(1)'}} />
  );
};

// ── Tab button ─────────────────────────────────────────────────────────────────

const TabBtn: React.FC<{label:string;active:boolean;onClick:()=>void}> = ({label,active,onClick}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
      style={{padding:'4px 12px',fontSize:12,fontWeight:500,borderRadius:6,border:'none',cursor:'pointer',
        background: active ? 'rgba(255,255,255,0.1)' : hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
        color: active ? '#ddd' : hovered ? '#888' : '#555',
        fontFamily:'inherit',transition:'all 0.1s',textTransform:'capitalize'}}>
      {label}
    </button>
  );
};

// ── Main page ──────────────────────────────────────────────────────────────────

const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [inputVal, setInputVal] = useState(searchParams.get('q') || '');
  const [annotations, setAnnotations] = useState<SearchAnnotation[]>([]);
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [documents, setDocuments] = useState<SearchDocument[]>([]);
  const [annotationsTotal, setAnnotationsTotal] = useState(0);
  const [usersTotal, setUsersTotal] = useState(0);
  const [documentsTotal, setDocumentsTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [fetchingMore, setFetchingMore] = useState(false);

  const LIMIT = 20;
  const q = searchParams.get('q') || '';
  const tab = (searchParams.get('type') || 'all') as TabType;
  // Multiple colors stored as repeated params
  const colorFilters = searchParams.getAll('color');
  const scopeUsername = searchParams.get('username') || '';

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setParam = (key: string, val: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (val) next.set(key, val); else next.delete(key);
      return next;
    });
  };

  const toggleColor = (hex: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      const existing = next.getAll('color');
      next.delete('color');
      if (existing.includes(hex)) {
        existing.filter(c => c !== hex).forEach(c => next.append('color', c));
      } else {
        [...existing, hex].forEach(c => next.append('color', c));
      }
      return next;
    });
  };

  const clearColors = () => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('color');
      return next;
    });
  };

  const fetchResults = useCallback(async (currentQ: string, currentTab: TabType, colors: string[], username: string, currentOffset: number, append = false) => {
    const hasFilter = currentQ.trim() || colors.length > 0 || username;
    if (!hasFilter) {
      setAnnotations([]); setUsers([]); setDocuments([]); setAnnotationsTotal(0); setUsersTotal(0); setDocumentsTotal(0); return;
    }
    if (append) setFetchingMore(true); else setLoading(true);
    try {
      const p = new URLSearchParams();
      if (currentQ.trim()) p.set('q', currentQ.trim());
      p.set('type', currentTab);
      p.set('limit', String(LIMIT));
      p.set('offset', String(currentOffset));
      colors.forEach(c => p.append('color', c));
      if (username) p.set('username', username);

      const res = await api.get(`/search?${p}`);
      const newAnns: SearchAnnotation[] = res.data.annotations || [];
      const newUsers: SearchUser[] = res.data.users || [];
      const newDocs: SearchDocument[] = res.data.documents || [];

      if (append) {
        setAnnotations(prev => [...prev, ...newAnns]);
        setUsers(prev => [...prev, ...newUsers]);
        setDocuments(prev => [...prev, ...newDocs]);
      } else {
        setAnnotations(newAnns);
        setUsers(newUsers);
        setDocuments(newDocs);
      }
      setAnnotationsTotal(res.data.annotationsTotal ?? 0);
      setUsersTotal(res.data.usersTotal ?? 0);
      setDocumentsTotal(res.data.documentsTotal ?? 0);
    } catch { /* silent */ }
    finally { setLoading(false); setFetchingMore(false); }
  }, []);

  // Run search when URL params change
  useEffect(() => {
    setOffset(0);
    fetchResults(q, tab, colorFilters, scopeUsername, 0, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tab, searchParams.get('color'), scopeUsername, fetchResults]);

  const handleInputChange = (val: string) => {
    setInputVal(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setParam('q', val), 300);
  };

  const loadMore = async () => {
    const nextOffset = offset + LIMIT;
    setOffset(nextOffset);
    await fetchResults(q, tab, colorFilters, scopeUsername, nextOffset, true);
  };

  const showAnn = tab === 'all' || tab === 'annotations';
  const showUsers = tab === 'all' || tab === 'users';
  const showDocuments = tab === 'all' || tab === 'documents';
  const hasFilter = !!(q.trim() || colorFilters.length > 0 || scopeUsername);
  const hasMore = (showAnn && annotations.length < annotationsTotal) || (showUsers && users.length < usersTotal) || (showDocuments && documents.length < documentsTotal);

  return (
    <div style={{ minHeight: '100vh', background: '#0e0e0e', color: '#fff', fontFamily: '"Inter", sans-serif' }}>
      <Navbar />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px' }}>
        {/* Search bar */}
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <Search style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#555' }} />
          <input
            type="text"
            value={inputVal}
            onChange={e => handleInputChange(e.target.value)}
            placeholder="Search annotations, people, URLs..."
            autoFocus
            style={{ width: '100%', background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px 14px 44px', fontSize: 16, color: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
            onFocus={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
            onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
          />
          {inputVal && (
            <button onClick={() => { setInputVal(''); setParam('q', ''); }}
              style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#555', display: 'flex' }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filters row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24, alignItems: 'center' }}>
          {/* Type tabs */}
          <div style={{ display: 'flex', gap: 2, background: '#141414', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: 3 }}>
            {(['all', 'annotations', 'users', 'documents'] as TabType[]).map(t => (
              <TabBtn key={t} label={t} active={tab===t} onClick={() => setParam('type', t === 'all' ? '' : t)} />
            ))}
          </div>

          {/* Color chips */}
          {(tab === 'all' || tab === 'annotations') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              {PALETTE_COLORS.map(({ hex, label }) => (
                <ColorChip key={hex} hex={hex} label={label} active={colorFilters.includes(hex)} onClick={() => toggleColor(hex)} />
              ))}
              {colorFilters.length > 0 && (
                <button onClick={clearColors} style={{ fontSize: 11, color: '#555', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>clear</button>
              )}
            </div>
          )}

          {/* Scope badge */}
          {scopeUsername && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'rgba(110,183,129,0.1)', border: '1px solid rgba(110,183,129,0.25)', fontSize: 12, color: '#6EB781', fontWeight: 600 }}>
              @{scopeUsername}
              <button onClick={() => setParam('username', '')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6EB781', padding: 0, display: 'flex' }}><X size={11} /></button>
            </div>
          )}
        </div>

        {/* Empty state */}
        {!hasFilter && (
          <div style={{ textAlign: 'center', paddingTop: 80, color: '#333', fontSize: 14 }}>
            <Search style={{ width: 32, height: 32, margin: '0 auto 16px', opacity: 0.3 }} />
            <p style={{ margin: 0 }}>Search for annotations, people, or documents</p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#2a2a2a' }}>Try a keyword, a URL, or filter by highlight color</p>
          </div>
        )}

        {/* Loading state */}
        {loading && hasFilter && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ padding: '18px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ width: 120, height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.04)', marginBottom: 10 }} />
                    <div style={{ width: '100%', height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.03)', marginBottom: 6 }} />
                    <div style={{ width: '70%', height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.03)' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No results */}
        {!loading && hasFilter && annotations.length === 0 && users.length === 0 && documents.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#444', fontSize: 14 }}>
            No results for this search
          </div>
        )}

        {/* Annotation results */}
        {!loading && showAnn && annotations.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            {tab === 'all' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, padding: '0 4px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Annotations</span>
                <span style={{ fontSize: 11, color: '#333' }}>{annotationsTotal} total</span>
              </div>
            )}
            {annotations.map(ann => <AnnotationResultCard key={ann.id} annotation={ann} />)}
          </div>
        )}

        {/* User results */}
        {!loading && showUsers && users.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            {tab === 'all' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, padding: '0 4px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: '0.1em' }}>People</span>
                <span style={{ fontSize: 11, color: '#333' }}>{usersTotal} total</span>
              </div>
            )}
            {users.map(u => <UserResultCard key={u.id} user={u} />)}
          </div>
        )}

        {!loading && showDocuments && documents.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            {tab === 'all' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, padding: '0 4px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Documents</span>
                <span style={{ fontSize: 11, color: '#333' }}>{documentsTotal} total</span>
              </div>
            )}
            {documents.map(doc => <DocumentResultCard key={doc.id} documentRecord={doc} />)}
          </div>
        )}

        {/* Load more */}
        {!loading && hasMore && (
          <div style={{ textAlign: 'center', paddingBottom: 40 }}>
            <LoadMoreBtn fetchingMore={fetchingMore} onClick={loadMore} />
          </div>
        )}
      </div>
    </div>
  );
};

const LoadMoreBtn: React.FC<{fetchingMore:boolean;onClick:()=>void}> = ({fetchingMore,onClick}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick} disabled={fetchingMore}
      onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
      style={{ padding: '10px 28px', fontSize: 13, fontWeight: 500, borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.1)', background: hovered && !fetchingMore ? 'rgba(255,255,255,0.05)' : 'transparent',
        color: fetchingMore ? '#444' : hovered ? '#ccc' : '#aaa',
        cursor: fetchingMore ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>
      {fetchingMore ? 'Loading...' : 'Load more'}
    </button>
  );
};

export default SearchPage;
