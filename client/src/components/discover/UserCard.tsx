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
        background: '#141414',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
        padding: '16px 16px 14px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        boxShadow: '0 16px 42px rgba(0,0,0,0.2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: user.profilePicture ? '#111' : 'linear-gradient(135deg, rgba(110,183,129,0.9), rgba(71,163,232,0.85))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 20,
            fontWeight: 700,
            overflow: 'hidden',
            flexShrink: 0,
            boxShadow: '0 0 0 3px rgba(255,255,255,0.04)',
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
                color: '#ededed',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {displayName}
            </div>
            <ArrowUpRight style={{ width: 14, height: 14, color: '#555', flexShrink: 0 }} />
          </div>
          <div style={{ fontSize: 12, color: '#777', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
            @{user.username}
          </div>
        </div>
      </div>

      <div
        style={{
          fontSize: 12,
          color: '#999',
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
            color: '#aaa',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
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
            color: '#aaa',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
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
            border: following ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(110,183,129,0.35)',
            background: following ? 'rgba(255,255,255,0.02)' : '#6EB781',
            color: following ? '#bbb' : '#0d0d0d',
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
