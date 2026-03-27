import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';
import api from '../lib/api';
import UserRow from './UserRow';
import type { UserRowData } from './UserRow';

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  currentUserId?: number;
}

const SearchModal: React.FC<SearchModalProps> = ({ open, onClose, currentUserId }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserRowData[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await api.get(`/users/search?q=${encodeURIComponent(q)}&limit=10`);
      setResults(response.data.users || []);
    } catch {
      setResults([]);
      toast.error('Search failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchUsers(value), 250);
  };

  const handleFollow = async (username: string) => {
    try {
      const response = await api.post(`/users/${username}/follow`);
      setResults(prev =>
        prev.map(u =>
          u.username === username ? { ...u, isFollowing: response.data.following } : u
        )
      );
    } catch {
      toast.error('Failed to follow user');
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
              maxWidth: '560px',
              background: '#1a1a1a',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
              pointerEvents: 'auto',
            }}
          >
            {/* Search input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <Search style={{ width: 16, height: 16, color: '#555', flexShrink: 0 }} />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search users..."
                value={query}
                onChange={(e) => handleInputChange(e.target.value)}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  fontSize: '15px',
                  color: '#fff',
                  fontFamily: 'inherit',
                }}
              />
              <button
                onClick={onClose}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '2px 6px',
                  fontSize: '11px',
                  color: '#666',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                }}
              >
                ESC
              </button>
            </div>

            {/* Results */}
            <div style={{ maxHeight: '420px', overflowY: 'auto', padding: '6px' }}>
              {loading && query.trim() && (
                <div style={{ padding: '24px 0', textAlign: 'center', color: '#555', fontSize: '13px' }}>
                  Searching...
                </div>
              )}

              {!loading && query.trim() && results.length === 0 && (
                <div style={{ padding: '24px 0', textAlign: 'center', color: '#555', fontSize: '13px' }}>
                  No users found
                </div>
              )}

              {!loading && !query.trim() && (
                <div style={{ padding: '24px 0', textAlign: 'center', color: '#444', fontSize: '13px' }}>
                  Type to search for users
                </div>
              )}

              {results.map(user => (
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
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SearchModal;
