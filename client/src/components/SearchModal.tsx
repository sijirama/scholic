import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../lib/api';
import UserRow from './UserRow';
import type { UserRowData } from './UserRow';
import ReactionStrip from './ReactionStrip';
import MentionText from './MentionText';

interface SearchAnnotation {
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
  createdAt: string;
  reactionCounts?: Record<string, number>;
  myReaction?: string;
  user: { id: number; username: string; firstName?: string; lastName?: string; profilePicture?: string };
}

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  currentUserId?: number;
  scopeUsername?: string;
}

type TabType = 'all' | 'annotations' | 'users' | 'documents';

interface SearchDocument {
  id: number;
  title: string;
  description: string;
  authors: string[];
  tags: string[];
  publishedYear?: number;
  user: { id: number; username: string; firstName?: string; lastName?: string; profilePicture?: string };
}


function hexToRgb(hex: string) {
  const h = hex?.startsWith('#') && hex.length === 7 ? hex : '#A8D5B5';
  return { r: parseInt(h.slice(1,3),16), g: parseInt(h.slice(3,5),16), b: parseInt(h.slice(5,7),16) };
}
function getDomain(url: string) { try { return new URL(url).hostname.replace('www.',''); } catch { return url; } }
function timeAgo(d: string) {
  const m = Math.floor((Date.now()-new Date(d).getTime())/60000);
  if(m<1) return 'just now'; if(m<60) return `${m}m`;
  const h=Math.floor(m/60); if(h<24) return `${h}h`; return `${Math.floor(h/24)}d`;
}

const AnnRow: React.FC<{ ann: SearchAnnotation; focused: boolean; onClick: () => void }> = ({ ann, focused, onClick }) => {
  const color = ann.highlightColor || '#A8D5B5';
  const { r, g, b } = hexToRgb(color);
  const domain = ann.linkDomain || getDomain(ann.url);
  const isImage = ann.type === 'image' && ann.imageUrl;
  const initial = ann.user.username?.[0]?.toUpperCase() || '?';
  const [hovered, setHovered] = useState(false);
  const bg = focused ? 'var(--surface-active)' : hovered ? 'var(--surface-hover)' : 'transparent';
  const highlightBg = `rgba(${r},${g},${b},0.32)`;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display:'flex', alignItems:'flex-start', gap:9, padding:'10px 12px', borderRadius:8, cursor:'pointer', background: bg, transition:'background 0.1s' }}
    >
      {/* Avatar */}
      <div style={{ width:26, height:26, borderRadius:'50%', flexShrink:0, overflow:'hidden', background: ann.user.profilePicture ? 'transparent' : 'var(--avatar-gradient-faint)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'var(--text-soft)', marginTop:1 }}>
        {ann.user.profilePicture
          ? <img src={ann.user.profilePicture} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          : initial}
      </div>

      <div style={{ flex:1, minWidth:0 }}>
        {/* Author + time header */}
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
          <span style={{ fontSize:11, fontWeight:600, color:'var(--text-soft)' }}>@{ann.user.username}</span>
          <span style={{ fontSize:10, color:'var(--text-dim)' }}>{timeAgo(ann.createdAt)}</span>
        </div>

        {/* Screenshot — clipped strip */}
        {isImage && (
          <div style={{ borderRadius:6, overflow:'hidden', height:72, marginBottom:5, border:'1px solid var(--border)' }}>
            <img src={ann.imageUrl} alt="screenshot" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'top' }} />
          </div>
        )}

        {/* Highlighted quote */}
        {!isImage && ann.quoteText && (
          <p style={{ margin:'0 0 4px', fontSize:13, lineHeight:1.55, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as const }}>
            <mark style={{ background: highlightBg, color:'var(--text-muted)', borderRadius:3, padding:'1px 4px', fontStyle:'italic', boxDecorationBreak:'clone' } as React.CSSProperties}>
              {ann.quoteText}
            </mark>
          </p>
        )}

        {/* Annotation note */}
        {ann.text && (
          <p style={{ margin:'0 0 5px', fontSize:12, color:'var(--text-soft)', lineHeight:1.5, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>
            <MentionText text={ann.text} />
          </p>
        )}

        {/* Page title or raw URL + reactions (read-only here) */}
        <div style={{ display:'flex', alignItems:'center', gap:8, overflow:'hidden', flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, overflow:'hidden', flex:1, minWidth:0 }}>
            {ann.linkFavicon && <img src={ann.linkFavicon} alt="" style={{ width:11, height:11, borderRadius:2, flexShrink:0 }} />}
            <span style={{ fontSize:11, color:'var(--text-dim)', overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>
              {ann.linkTitle || domain || ann.url}
            </span>
          </div>
          <ReactionStrip
            annotationId={ann.id}
            reactionCounts={ann.reactionCounts}
            myReaction={ann.myReaction}
            canReact={false}
          />
        </div>
      </div>
    </div>
  );
};

const DocumentRow: React.FC<{ doc: SearchDocument; focused: boolean; onClick: () => void }> = ({ doc, focused, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const bg = focused ? 'var(--surface-active)' : hovered ? 'var(--surface-hover)' : 'transparent';
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: bg, transition: 'background 0.1s' }}
    >
      <div style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <FileText style={{ width: 13, height: 13, color: 'var(--accent)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</span>
          {doc.publishedYear && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{doc.publishedYear}</span>}
        </div>
        {doc.authors.length > 0 && (
          <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--text-soft)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {doc.authors.join(', ')}
          </p>
        )}
        {doc.description && (
          <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {doc.description}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>by @{doc.user.username}</span>
          {doc.tags.slice(0, 3).map((tag) => (
            <span key={tag} style={{ fontSize: 10, color: 'var(--color-blue-text)' }}>{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

const SearchModal: React.FC<SearchModalProps> = ({ open, onClose, currentUserId, scopeUsername }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TabType>('all');
  const [annotations, setAnnotations] = useState<SearchAnnotation[]>([]);
  const [users, setUsers] = useState<UserRowData[]>([]);
  const [documents, setDocuments] = useState<SearchDocument[]>([]);
  const [annotationsTotal, setAnnotationsTotal] = useState(0);
  const [usersTotal, setUsersTotal] = useState(0);
  const [documentsTotal, setDocumentsTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setQuery(''); setAnnotations([]); setUsers([]); setDocuments([]);
      setAnnotationsTotal(0); setUsersTotal(0); setDocumentsTotal(0); setFocusedIdx(-1);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const doSearch = useCallback(async (q: string, t: TabType) => {
    if (!q.trim() && !scopeUsername) {
      setAnnotations([]); setUsers([]); setDocuments([]); setAnnotationsTotal(0); setUsersTotal(0); setDocumentsTotal(0); setLoading(false); return;
    }
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (q.trim()) p.set('q', q.trim());
      p.set('type', t);
      p.set('limit', '8');
      if (scopeUsername) p.set('username', scopeUsername);
      const res = await api.get(`/search?${p}`);
      setAnnotations(res.data.annotations || []);
      setUsers(res.data.users || []);
      setDocuments(res.data.documents || []);
      setAnnotationsTotal(res.data.annotationsTotal ?? 0);
      setUsersTotal(res.data.usersTotal ?? 0);
      setDocumentsTotal(res.data.documentsTotal ?? 0);
      setFocusedIdx(-1);
    } catch { toast.error('Search failed'); }
    finally { setLoading(false); }
  }, [scopeUsername]);

  const schedule = useCallback((q: string, t: TabType) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q, t), 200);
  }, [doSearch]);

  const handleQuery = (v: string) => { setQuery(v); schedule(v, tab); };
  const handleTab = (t: TabType) => { setTab(t); schedule(query, t); };
  const handleFollow = async (username: string) => {
    try { const r = await api.post(`/users/${username}/follow`); setUsers(p=>p.map(u=>u.username===username?{...u,isFollowing:r.data.following}:u)); }
    catch { toast.error('Failed'); }
  };

  const allPaths = [
    ...annotations.map(a => `/annotation/${a.id}`),
    ...users.map(u => `/u/${u.username}`),
    ...documents.map(d => `/document/${d.id}`),
  ];
  const go = (path: string) => { onClose(); navigate(path); };
  const buildParams = () => {
    const p = new URLSearchParams();
    if (query.trim()) p.set('q', query.trim());
    if (tab !== 'all') p.set('type', tab);
    if (scopeUsername) p.set('username', scopeUsername);
    return p.toString();
  };
  const goFull = () => go(`/search?${buildParams()}`);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key==='Escape') { onClose(); return; }
      if (e.key==='ArrowDown') { e.preventDefault(); setFocusedIdx(i=>Math.min(i+1,allPaths.length-1)); }
      else if (e.key==='ArrowUp') { e.preventDefault(); setFocusedIdx(i=>Math.max(i-1,-1)); }
      else if (e.key==='Enter') {
        e.preventDefault();
        if (focusedIdx>=0 && focusedIdx<allPaths.length) go(allPaths[focusedIdx]);
        else if (query.trim()||scopeUsername) goFull();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, focusedIdx, allPaths, query, tab, scopeUsername]); // eslint-disable-line react-hooks/exhaustive-deps

  const showAnn = tab==='all'||tab==='annotations';
  const showUsers = tab==='all'||tab==='users';
  const showDocuments = tab==='all'||tab==='documents';
  const hasResults = annotations.length>0||users.length>0||documents.length>0;
  const hasQuery = !!(query.trim()||scopeUsername);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}}
            onClick={onClose} style={{position:'fixed',inset:0,background:'var(--overlay)',backdropFilter:'blur(4px)',zIndex:9998}} />

          <div style={{position:'fixed',inset:0,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:'12vh',zIndex:9999,pointerEvents:'none'}}>
            <motion.div initial={{opacity:0,y:-10,scale:0.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-10,scale:0.98}}
              transition={{duration:0.18,ease:[0.22,1,0.36,1]}}
              style={{width:'100%',maxWidth:700,background:'var(--bg-elevated)',border:'1px solid var(--border)',borderRadius:16,overflow:'hidden',boxShadow:'var(--shadow-lg)',pointerEvents:'auto'}}
            >
              {/* Input row */}
              <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 16px',borderBottom:'1px solid var(--border)'}}>
                <Search style={{width:15,height:15,color:'var(--text-dim)',flexShrink:0}} />
                <input ref={inputRef} type="text"
                  placeholder={scopeUsername ? `Search @${scopeUsername}'s annotations...` : 'Search annotations, people, URLs...'}
                  value={query} onChange={e=>handleQuery(e.target.value)}
                  style={{flex:1,background:'none',border:'none',outline:'none',fontSize:15,color:'var(--text)',fontFamily:'inherit'}} />
                {loading && <div style={{width:14,height:14,border:'2px solid var(--border)',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'scholic-spin 0.6s linear infinite',flexShrink:0}} />}
                <button onClick={onClose} style={{background:'var(--surface-3)',border:'none',borderRadius:5,padding:'2px 6px',fontSize:11,color:'var(--text-dim)',cursor:'pointer',fontFamily:'monospace',flexShrink:0}}>ESC</button>
              </div>

              {/* Tabs + color chips */}
              <div style={{padding:'8px 12px 6px',borderBottom:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:6}}>
                <div style={{display:'flex',gap:2}}>
                  {(['all','annotations','users','documents'] as TabType[]).map(t=>(
                    <TabBtn key={t} label={t} active={tab===t} onClick={()=>handleTab(t)} />
                  ))}
                </div>
                {scopeUsername && (
                  <div style={{display:'inline-flex',alignItems:'center',padding:'2px 8px',borderRadius:20,background:'var(--accent-soft)',border:'1px solid var(--accent-border)',fontSize:11,color:'var(--accent)',fontWeight:600,alignSelf:'flex-start'}}>
                    @{scopeUsername}
                  </div>
                )}
              </div>

              {/* Results */}
              <div style={{maxHeight:480,overflowY:'auto'}}>
                {!hasQuery && <div style={{padding:'28px 0',textAlign:'center',color:'var(--text-dim)',fontSize:13}}>Type to search{scopeUsername?` @${scopeUsername}`:''}</div>}
                {hasQuery&&!loading&&!hasResults && <div style={{padding:'28px 0',textAlign:'center',color:'var(--text-dim)',fontSize:13}}>No results</div>}

                {showAnn&&annotations.length>0&&(
                  <div style={{padding:'8px 6px 2px'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'2px 8px 5px'}}>
                      <span style={{fontSize:9,fontWeight:700,color:'var(--text-dim)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Annotations</span>
                      {annotationsTotal>annotations.length
                        ? <SeeAllBtn onClick={goFull} count={annotationsTotal} />
                        : annotationsTotal>0 && <span style={{fontSize:10,color:'var(--text-dim)'}}>{annotationsTotal}</span>}
                    </div>
                    {annotations.map((ann,i)=>(
                      <AnnRow key={ann.id} ann={ann} focused={focusedIdx===i} onClick={()=>go(`/annotation/${ann.id}`)} />
                    ))}
                  </div>
                )}

                {showUsers&&users.length>0&&(
                  <div style={{padding:'8px 6px 2px',borderTop:annotations.length>0?'1px solid var(--border)':'none'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'2px 8px 5px'}}>
                      <span style={{fontSize:9,fontWeight:700,color:'var(--text-dim)',textTransform:'uppercase',letterSpacing:'0.1em'}}>People</span>
                      {usersTotal>0&&<span style={{fontSize:10,color:'var(--text-dim)'}}>{usersTotal}</span>}
                    </div>
                    {users.map(u=><UserRow key={u.id} user={u} currentUserId={currentUserId} onFollow={handleFollow} showFollowButton onNavigate={onClose} />)}
                  </div>
                )}

                {showDocuments&&documents.length>0&&(
                  <div style={{padding:'8px 6px 2px',borderTop:(annotations.length>0||users.length>0)?'1px solid var(--border)':'none'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'2px 8px 5px'}}>
                      <span style={{fontSize:9,fontWeight:700,color:'var(--text-dim)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Documents</span>
                      {documentsTotal>0&&<span style={{fontSize:10,color:'var(--text-dim)'}}>{documentsTotal}</span>}
                    </div>
                    {documents.map((doc, i)=><DocumentRow key={doc.id} doc={doc} focused={focusedIdx===annotations.length + users.length + i} onClick={()=>go(`/document/${doc.id}`)} />)}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{padding:'7px 14px',borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:10,color:'var(--text-faint)'}}>↑↓ navigate · ↵ open · ⌘K close</span>
                {hasQuery&&<FullResultsBtn onClick={goFull} />}
              </div>
            </motion.div>
          </div>
          <style>{`@keyframes scholic-spin{to{transform:rotate(360deg)}}`}</style>
        </>
      )}
    </AnimatePresence>
  );
};

// ── Small internal components ──────────────────────────────────────────────────

const TabBtn: React.FC<{label:string;active:boolean;onClick:()=>void}> = ({label,active,onClick}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
      style={{padding:'3px 11px',fontSize:12,fontWeight:500,borderRadius:6,border:'none',cursor:'pointer',
        background: active ? 'var(--surface-active)' : hovered ? 'var(--surface-hover)' : 'transparent',
        color: active ? 'var(--text-muted)' : hovered ? 'var(--text-soft)' : 'var(--text-dim)',
        fontFamily:'inherit',transition:'all 0.1s',textTransform:'capitalize'}}>
      {label}
    </button>
  );
};


const SeeAllBtn: React.FC<{onClick:()=>void;count:number}> = ({onClick,count}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
      style={{background:'none',border:'none',cursor:'pointer',padding:0,
        fontSize:10,color: hovered ? 'var(--accent-strong)' : 'var(--accent)',
        fontFamily:'inherit',transition:'color 0.1s'}}>
      See all {count} →
    </button>
  );
};

const FullResultsBtn: React.FC<{onClick:()=>void}> = ({onClick}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
      style={{fontSize:11,color: hovered ? 'var(--text-soft)' : 'var(--text-faint)',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',transition:'color 0.1s'}}>
      Full results →
    </button>
  );
};

export default SearchModal;
