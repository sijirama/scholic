import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

interface MentionProfile {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  bio?: string;
  followersCount?: number;
  followingCount?: number;
}

interface MentionTextProps {
  text: string;
}

const MENTION_REGEX = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,30})/g;
const profileCache = new Map<string, MentionProfile | null>();
const profileRequests = new Map<string, Promise<MentionProfile | null>>();

function parseMentionParts(text: string) {
  const parts: Array<{ type: 'text'; value: string } | { type: 'mention'; username: string; value: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    const prefix = match[1] || '';
    const username = match[2];
    const mentionStart = match.index + prefix.length;
    const mentionEnd = mentionStart + username.length + 1;

    if (mentionStart > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, mentionStart) });
    }

    parts.push({ type: 'mention', username, value: `@${username}` });
    lastIndex = mentionEnd;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return parts;
}

async function fetchMentionProfile(username: string): Promise<MentionProfile | null> {
  const key = username.toLowerCase();
  if (profileCache.has(key)) return profileCache.get(key) ?? null;

  const existing = profileRequests.get(key);
  if (existing) return existing;

  const request = api
    .get(`/users/${encodeURIComponent(username)}?limit=1&offset=0`)
    .then((response) => {
      const profile = response.data?.user ?? null;
      profileCache.set(key, profile);
      return profile as MentionProfile | null;
    })
    .catch(() => {
      profileCache.set(key, null);
      return null;
    })
    .finally(() => {
      profileRequests.delete(key);
    });

  profileRequests.set(key, request);
  return request;
}

const MentionPopover: React.FC<{
  username: string;
  anchor: DOMRect;
  profile: MentionProfile | null;
  loading: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onNavigate: () => void;
}> = ({ username, anchor, profile, loading, onMouseEnter, onMouseLeave, onNavigate }) => {
  const width = 286;
  const estimatedHeight = profile?.bio ? 174 : 138;
  const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
  const below = anchor.bottom + 10;
  const top = below + estimatedHeight > window.innerHeight
    ? Math.max(12, anchor.top - estimatedHeight - 10)
    : below;
  const displayName = profile
    ? [profile.firstName, profile.lastName].filter(Boolean).join(' ')
    : '';
  const initial = (profile?.username || username)[0]?.toUpperCase() || '?';

  return createPortal(
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        top,
        left,
        width,
        zIndex: 10000,
        background: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        boxShadow: '0 18px 48px rgba(0,0,0,0.45)',
        padding: 14,
        color: '#fff',
        fontFamily: '"Inter", sans-serif',
        pointerEvents: 'auto',
      }}
    >
      {loading ? (
        <span style={{ display: 'block', fontSize: 12, color: '#777' }}>Loading profile...</span>
      ) : profile ? (
        <>
          <span style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                overflow: 'hidden',
                flexShrink: 0,
                background: 'linear-gradient(135deg, rgba(110,183,129,0.55), rgba(71,163,232,0.45))',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {profile.profilePicture
                ? <img src={profile.profilePicture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initial}
            </span>
            <span style={{ display: 'block', minWidth: 0, flex: 1 }}>
              {displayName && (
                <span style={{ display: 'block', color: '#eee', fontSize: 13, fontWeight: 700, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayName}
                </span>
              )}
              <span style={{ display: 'block', color: '#6EB781', fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>
                @{profile.username}
              </span>
              <span style={{ display: 'block', color: '#666', fontSize: 11, lineHeight: 1.4, marginTop: 2 }}>
                {profile.followersCount ?? 0} followers
              </span>
            </span>
          </span>
          {profile.bio && (
            <span style={{ display: 'block', color: '#aaa', fontSize: 12, lineHeight: 1.5, marginTop: 10, overflowWrap: 'break-word' }}>
              {profile.bio}
            </span>
          )}
          <span
            role="link"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onNavigate();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onNavigate();
              }
            }}
            style={{
              display: 'inline-flex',
              marginTop: 12,
              color: '#fff',
              background: 'rgba(110,183,129,0.18)',
              border: '1px solid rgba(110,183,129,0.28)',
              borderRadius: 7,
              padding: '5px 10px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            View profile
          </span>
        </>
      ) : (
        <>
          <span style={{ display: 'block', color: '#eee', fontSize: 13, fontWeight: 700 }}>@{username}</span>
          <span style={{ display: 'block', color: '#777', fontSize: 12, marginTop: 4 }}>Profile not found</span>
        </>
      )}
    </div>,
    document.body
  );
};

const MentionToken: React.FC<{ username: string; label: string }> = ({ username, label }) => {
  const navigate = useNavigate();
  const tokenRef = React.useRef<HTMLSpanElement>(null);
  const closeTimerRef = React.useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const [open, setOpen] = React.useState(false);
  const [anchor, setAnchor] = React.useState<DOMRect | null>(null);
  const [profile, setProfile] = React.useState<MentionProfile | null>(null);
  const [loading, setLoading] = React.useState(false);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const updateAnchor = React.useCallback(() => {
    const rect = tokenRef.current?.getBoundingClientRect();
    if (rect) setAnchor(rect);
  }, []);

  const openPopover = React.useCallback(() => {
    clearCloseTimer();
    updateAnchor();
    setOpen(true);
  }, [clearCloseTimer, updateAnchor]);

  const scheduleClose = React.useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 150);
  }, [clearCloseTimer]);

  const goToProfile = React.useCallback(() => {
    setOpen(false);
    navigate(`/u/${username}`);
  }, [navigate, username]);

  React.useEffect(() => {
    if (!open) return;

    let active = true;
    const key = username.toLowerCase();
    const cached = profileCache.get(key);
    if (profileCache.has(key)) {
      setProfile(cached ?? null);
      setLoading(false);
    } else {
      setLoading(true);
      fetchMentionProfile(username).then((nextProfile) => {
        if (!active) return;
        setProfile(nextProfile);
        setLoading(false);
      });
    }

    const reposition = () => updateAnchor();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    return () => {
      active = false;
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, updateAnchor, username]);

  React.useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return (
    <>
      <span
        ref={tokenRef}
        role="link"
        tabIndex={0}
        onMouseEnter={openPopover}
        onMouseLeave={scheduleClose}
        onFocus={openPopover}
        onBlur={scheduleClose}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          goToProfile();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            goToProfile();
          }
        }}
        style={{
          display: 'inline',
          color: '#6EB781',
          background: 'rgba(110,183,129,0.14)',
          border: '1px solid rgba(110,183,129,0.22)',
          borderRadius: 5,
          padding: '0 4px',
          fontWeight: 700,
          cursor: 'pointer',
          outline: 'none',
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
        } as React.CSSProperties}
      >
        {label}
      </span>
      {open && anchor && (
        <MentionPopover
          username={username}
          anchor={anchor}
          profile={profile}
          loading={loading}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
          onNavigate={goToProfile}
        />
      )}
    </>
  );
};

const MentionText: React.FC<MentionTextProps> = ({ text }) => {
  const parts = React.useMemo(() => parseMentionParts(text), [text]);

  return (
    <>
      {parts.map((part, index) => (
        part.type === 'mention'
          ? <MentionToken key={`${part.username}-${index}`} username={part.username} label={part.value} />
          : <React.Fragment key={`text-${index}`}>{part.value}</React.Fragment>
      ))}
    </>
  );
};

export default MentionText;
