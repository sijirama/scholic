import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import api from '../lib/api';
import UserRow from './UserRow';
import type { UserRowData } from './UserRow';

type Tab = 'followers' | 'following';

interface FollowersModalProps {
  open: boolean;
  onClose: () => void;
  username: string;
  initialTab?: Tab;
  currentUserId?: number;
  followersCount: number;
  followingCount: number;
}

const FollowersModal: React.FC<FollowersModalProps> = ({
  open,
  onClose,
  username,
  initialTab = 'followers',
  currentUserId,
  followersCount,
  followingCount,
}) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [users, setUsers] = useState<UserRowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset when tab or modal state changes
  useEffect(() => {
    if (open) {
      setTab(initialTab);
    }
  }, [open, initialTab]);

  const fetchUsers = useCallback(async (t: Tab, off: number, reset: boolean) => {
    setLoading(true);
    try {
      const response = await api.get(`/users/${username}/${t}?limit=20&offset=${off}`);
      const fetched: UserRowData[] = response.data.users || [];
      const total: number = response.data.total || 0;
      setUsers(prev => {
        const next = reset ? fetched : [...prev, ...fetched];
        setHasMore(next.length < total);
        return next;
      });
      setOffset(off + fetched.length);
    } catch {
      if (reset) setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [username]);

  // Fetch on tab change — don't clear users until new data arrives (avoids layout glitch)
  useEffect(() => {
    if (!open) return;
    setOffset(0);
    setHasMore(true);
    setLoading(true);
    let cancelled = false;
    api.get(`/users/${username}/${tab}?limit=20&offset=0`).then(response => {
      if (cancelled) return;
      const fetched: UserRowData[] = response.data.users || [];
      const total: number = response.data.total || 0;
      setUsers(fetched);
      setHasMore(fetched.length < total);
      setOffset(fetched.length);
    }).catch(() => {
      if (!cancelled) setUsers([]);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tab, open, username]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleFollow = async (targetUsername: string) => {
    try {
      const response = await api.post(`/users/${targetUsername}/follow`);
      setUsers(prev =>
        prev.map(u =>
          u.username === targetUsername ? { ...u, isFollowing: response.data.following } : u
        )
      );
    } catch (err) {
      console.error('Failed to toggle follow', err);
    }
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || loading || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      fetchUsers(tab, offset, false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(4px)',
              zIndex: 9998,
            }}
          />

          {/* Modal wrapper for centering */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              pointerEvents: 'none',
            }}
          >
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{
              width: '100%',
              maxWidth: '520px',
              background: '#1a1a1a',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
              pointerEvents: 'auto',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 0 16px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>@{username}</span>
              <button
                onClick={onClose}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'flex' }}
                className="hover:bg-white/5"
              >
                <X style={{ width: 16, height: 16, color: '#666' }} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 16px', marginTop: '8px' }}>
              {(['followers', 'following'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    borderBottom: tab === t ? '2px solid #6EB781' : '2px solid transparent',
                    color: tab === t ? '#fff' : '#666',
                    fontSize: '13px',
                    fontWeight: 500,
                    padding: '10px 0',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'color 0.15s',
                  }}
                >
                  {t === 'followers' ? `${followersCount} Followers` : `${followingCount} Following`}
                </button>
              ))}
            </div>

            {/* User list */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              style={{ height: '420px', overflowY: 'auto', padding: '6px' }}
            >
              <div
                style={{
                  opacity: loading ? 0 : 1,
                  transition: 'opacity 0.15s ease',
                }}
              >
                {users.length === 0 && !loading && (
                  <div style={{ padding: '32px 0', textAlign: 'center', color: '#555', fontSize: '13px' }}>
                    {tab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
                  </div>
                )}

                {users.map(user => (
                  <UserRow
                    key={user.id}
                    user={user}
                    currentUserId={currentUserId}
                    onFollow={handleFollow}
                    showFollowButton
                    onNavigate={onClose}
                  />
                ))}
              </div>

              {loading && (
                <div style={{ padding: '32px 0', textAlign: 'center', color: '#555', fontSize: '13px' }}>
                  Loading...
                </div>
              )}
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default FollowersModal;
