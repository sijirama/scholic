import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../lib/api';
import UserRow from './UserRow';
import type { UserRowData } from './UserRow';
import ReactionStrip from './ReactionStrip';

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

type TabType = 'all' | 'annotations' | 'users';


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
  const bg = focused ? 'rgba(255,255,255,0.08)' : hovered ? 'rgba(255,255,255,0.04)' : 'transparent';
  const highlightBg = `rgba(${r},${g},${b},0.32)`;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display:'flex', alignItems:'flex-start', gap:9, padding:'10px 12px', borderRadius:8, cursor:'pointer', background: bg, transition:'background 0.1s' }}
    >
      {/* Avatar */}
      <div style={{ width:26, height:26, borderRadius:'50%', flexShrink:0, overflow:'hidden', background: ann.user.profilePicture ? 'transparent' : 'linear-gradient(135deg,rgba(110,183,129,0.4),rgba(71,163,232,0.4))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#aaa', marginTop:1 }}>
        {ann.user.profilePicture
          ? <img src={ann.user.profilePicture} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          : initial}
      </div>

      <div style={{ flex:1, minWidth:0 }}>
        {/* Author + time header */}
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
          <span style={{ fontSize:11, fontWeight:600, color:'#aaa' }}>@{ann.user.username}</span>
          <span style={{ fontSize:10, color:'#444' }}>{timeAgo(ann.createdAt)}</span>
        </div>

        {/* Screenshot — clipped strip */}
        {isImage && (
          <div style={{ borderRadius:6, overflow:'hidden', height:72, marginBottom:5, border:'1px solid rgba(255,255,255,0.08)' }}>
            <img src={ann.imageUrl} alt="screenshot" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'top' }} />
          </div>
        )}

        {/* Highlighted quote */}
        {!isImage && ann.quoteText && (
          <p style={{ margin:'0 0 4px', fontSize:13, lineHeight:1.55, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as const }}>
            <mark style={{ background: highlightBg, color:'#ddd', borderRadius:3, padding:'1px 4px', fontStyle:'italic', boxDecorationBreak:'clone' } as React.CSSProperties}>
              {ann.quoteText}
            </mark>
          </p>
        )}

        {/* Annotation note */}
        {ann.text && (
          <p style={{ margin:'0 0 5px', fontSize:12, color:'#aaa', lineHeight:1.5, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>
            {ann.text}
          </p>
        )}

        {/* Page title or raw URL + reactions (read-only here) */}
        <div style={{ display:'flex', alignItems:'center', gap:8, overflow:'hidden', flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, overflow:'hidden', flex:1, minWidth:0 }}>
            {ann.linkFavicon && <img src={ann.linkFavicon} alt="" style={{ width:11, height:11, borderRadius:2, flexShrink:0 }} />}
            <span style={{ fontSize:11, color:'#666', overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>
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

const SearchModal: React.FC<SearchModalProps> = ({ open, onClose, currentUserId, scopeUsername }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TabType>('all');
  const [annotations, setAnnotations] = useState<SearchAnnotation[]>([]);
  const [users, setUsers] = useState<UserRowData[]>([]);
  const [annotationsTotal, setAnnotationsTotal] = useState(0);
  const [usersTotal, setUsersTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setQuery(''); setAnnotations([]); setUsers([]);
      setAnnotationsTotal(0); setUsersTotal(0); setFocusedIdx(-1);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const doSearch = useCallback(async (q: string, t: TabType) => {
    if (!q.trim() && !scopeUsername) {
      setAnnotations([]); setUsers([]); setAnnotationsTotal(0); setUsersTotal(0); setLoading(false); return;
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
      setAnnotationsTotal(res.data.annotationsTotal ?? 0);
      setUsersTotal(res.data.usersTotal ?? 0);
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
  const hasResults = annotations.length>0||users.length>0;
  const hasQuery = !!(query.trim()||scopeUsername);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}}
            onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',backdropFilter:'blur(4px)',zIndex:9998}} />

          <div style={{position:'fixed',inset:0,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:'12vh',zIndex:9999,pointerEvents:'none'}}>
            <motion.div initial={{opacity:0,y:-10,scale:0.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-10,scale:0.98}}
              transition={{duration:0.18,ease:[0.22,1,0.36,1]}}
              style={{width:'100%',maxWidth:700,background:'#191919',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,overflow:'hidden',boxShadow:'0 32px 64px rgba(0,0,0,0.5)',pointerEvents:'auto'}}
            >
              {/* Input row */}
              <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                <Search style={{width:15,height:15,color:'#555',flexShrink:0}} />
                <input ref={inputRef} type="text"
                  placeholder={scopeUsername ? `Search @${scopeUsername}'s annotations...` : 'Search annotations, people, URLs...'}
                  value={query} onChange={e=>handleQuery(e.target.value)}
                  style={{flex:1,background:'none',border:'none',outline:'none',fontSize:15,color:'#fff',fontFamily:'inherit'}} />
                {loading && <div style={{width:14,height:14,border:'2px solid rgba(255,255,255,0.08)',borderTopColor:'#6EB781',borderRadius:'50%',animation:'scholic-spin 0.6s linear infinite',flexShrink:0}} />}
                <button onClick={onClose} style={{background:'rgba(255,255,255,0.06)',border:'none',borderRadius:5,padding:'2px 6px',fontSize:11,color:'#555',cursor:'pointer',fontFamily:'monospace',flexShrink:0}}>ESC</button>
              </div>

              {/* Tabs + color chips */}
              <div style={{padding:'8px 12px 6px',borderBottom:'1px solid rgba(255,255,255,0.04)',display:'flex',flexDirection:'column',gap:6}}>
                <div style={{display:'flex',gap:2}}>
                  {(['all','annotations','users'] as TabType[]).map(t=>(
                    <TabBtn key={t} label={t} active={tab===t} onClick={()=>handleTab(t)} />
                  ))}
                </div>
                {scopeUsername && (
                  <div style={{display:'inline-flex',alignItems:'center',padding:'2px 8px',borderRadius:20,background:'rgba(110,183,129,0.1)',border:'1px solid rgba(110,183,129,0.22)',fontSize:11,color:'#6EB781',fontWeight:600,alignSelf:'flex-start'}}>
                    @{scopeUsername}
                  </div>
                )}
              </div>

              {/* Results */}
              <div style={{maxHeight:480,overflowY:'auto'}}>
                {!hasQuery && <div style={{padding:'28px 0',textAlign:'center',color:'#2e2e2e',fontSize:13}}>Type to search{scopeUsername?` @${scopeUsername}`:''}</div>}
                {hasQuery&&!loading&&!hasResults && <div style={{padding:'28px 0',textAlign:'center',color:'#444',fontSize:13}}>No results</div>}

                {showAnn&&annotations.length>0&&(
                  <div style={{padding:'8px 6px 2px'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'2px 8px 5px'}}>
                      <span style={{fontSize:9,fontWeight:700,color:'#2e2e2e',textTransform:'uppercase',letterSpacing:'0.1em'}}>Annotations</span>
                      {annotationsTotal>annotations.length
                        ? <SeeAllBtn onClick={goFull} count={annotationsTotal} />
                        : annotationsTotal>0 && <span style={{fontSize:10,color:'#333'}}>{annotationsTotal}</span>}
                    </div>
                    {annotations.map((ann,i)=>(
                      <AnnRow key={ann.id} ann={ann} focused={focusedIdx===i} onClick={()=>go(`/annotation/${ann.id}`)} />
                    ))}
                  </div>
                )}

                {showUsers&&users.length>0&&(
                  <div style={{padding:'8px 6px 2px',borderTop:annotations.length>0?'1px solid rgba(255,255,255,0.04)':'none'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'2px 8px 5px'}}>
                      <span style={{fontSize:9,fontWeight:700,color:'#2e2e2e',textTransform:'uppercase',letterSpacing:'0.1em'}}>People</span>
                      {usersTotal>0&&<span style={{fontSize:10,color:'#333'}}>{usersTotal}</span>}
                    </div>
                    {users.map(u=><UserRow key={u.id} user={u} currentUserId={currentUserId} onFollow={handleFollow} showFollowButton onNavigate={onClose} />)}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{padding:'7px 14px',borderTop:'1px solid rgba(255,255,255,0.04)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:10,color:'#252525'}}>↑↓ navigate · ↵ open · ⌘K close</span>
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
        background: active ? 'rgba(255,255,255,0.1)' : hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
        color: active ? '#ddd' : hovered ? '#888' : '#555',
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
        fontSize:10,color: hovered ? '#7ec890' : '#6EB781',
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
      style={{fontSize:11,color: hovered ? '#888' : '#3a3a3a',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',transition:'color 0.1s'}}>
      Full results →
    </button>
  );
};

export default SearchModal;
