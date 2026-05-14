import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, Highlighter, Users } from 'lucide-react';
import api from '../../lib/api';
import { toast } from 'sonner';

export interface DiscoverAuthor {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  bio?: string;
  memberNumber?: number;
  showMemberNumber?: boolean;
  annotationCount: number;
  followerCount: number;
}

interface UserCardProps {
  user: DiscoverAuthor;
  currentUserId?: number;
  isAuthed: boolean;
}

const UserCard: React.FC<UserCardProps> = ({ user, currentUserId, isAuthed }) => {
  const navigate = useNavigate();
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;
  const initial = user.username?.[0]?.toUpperCase() || '?';
  const isSelf = currentUserId === user.id;

  const toggleFollow = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!isAuthed || busy) return;
    setBusy(true);
    const prev = following;
    setFollowing(!prev);
    try {
      await api.post(`/users/${user.username}/follow`);
    } catch {
      setFollowing(prev);
      toast.error('Could not update follow');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      onClick={() => navigate(`/u/${user.username}`)}
      style={{
        flex: '0 0 280px',
        minHeight: 250,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '16px 16px 14px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: user.profilePicture ? 'var(--surface-inset)' : 'var(--avatar-gradient-strong)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-inverse)',
            fontSize: 20,
            fontWeight: 700,
            overflow: 'hidden',
            flexShrink: 0,
            boxShadow: '0 0 0 3px var(--surface)',
          }}
        >
          {user.profilePicture ? (
            <img
              src={user.profilePicture}
              alt={user.username}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            initial
          )}
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                fontFamily: '"Outfit", sans-serif',
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {displayName}
            </div>
            <ArrowUpRight style={{ width: 14, height: 14, color: 'var(--text-dim)', flexShrink: 0 }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
            @{user.username}
          </div>
        </div>
      </div>

      <div
        style={{
          fontSize: 12,
          color: 'var(--text-soft)',
          lineHeight: 1.5,
          minHeight: 54,
          marginBottom: 14,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {user.bio || 'Active on Scholic'}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 9px',
            borderRadius: 999,
            fontSize: 11,
            color: 'var(--text-soft)',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
          }}
        >
          <Users style={{ width: 11, height: 11 }} />
          {user.followerCount}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 9px',
            borderRadius: 999,
            fontSize: 11,
            color: 'var(--text-soft)',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
          }}
        >
          <Highlighter style={{ width: 11, height: 11 }} />
          {user.annotationCount}
        </span>
      </div>

      {!isSelf && (
        <button
          onClick={toggleFollow}
          disabled={!isAuthed || busy}
          style={{
            marginTop: 'auto',
            width: '100%',
            padding: '10px 14px',
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 10,
            border: following ? '1px solid var(--border-strong)' : '1px solid var(--accent-border)',
            background: following ? 'var(--surface-inset)' : 'var(--accent)',
            color: following ? 'var(--text-soft)' : 'var(--text-inverse)',
            cursor: isAuthed ? 'pointer' : 'not-allowed',
            opacity: !isAuthed ? 0.5 : 1,
            fontFamily: 'inherit',
          }}
        >
          {following ? 'Following' : 'Follow'}
        </button>
      )}
    </motion.div>
  );
};

export default UserCard;
