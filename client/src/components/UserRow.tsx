import React from 'react';
import { useNavigate } from 'react-router-dom';

export interface UserRowData {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  memberNumber?: number;
  showMemberNumber?: boolean;
  followersCount?: number;
  followingCount?: number;
  isFollowing?: boolean;
}

interface UserRowProps {
  user: UserRowData;
  currentUserId?: number;
  onFollow?: (username: string) => void;
  showFollowButton?: boolean;
  onNavigate?: () => void;
}

const UserRow: React.FC<UserRowProps> = ({ user, currentUserId, onFollow, showFollowButton = false, onNavigate }) => {
  const navigate = useNavigate();

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const initial = user.username?.[0]?.toUpperCase() || '?';
  const isSelf = currentUserId === user.id;

  const handleClick = () => {
    onNavigate?.();
    navigate(`/u/${user.username}`);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 12px',
        borderRadius: '10px',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: user.profilePicture ? 'transparent' : 'var(--avatar-gradient)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--text-inverse)',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {user.profilePicture ? (
          <img src={user.profilePicture} alt={user.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          initial
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {displayName && (
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayName}
            </span>
          )}
          {user.showMemberNumber && user.memberNumber && user.memberNumber > 0 && (
            <span
              style={{
                backgroundColor: 'var(--color-yellow-soft)',
                color: 'var(--color-yellow-text)',
                padding: '1px 5px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              #{user.memberNumber}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-soft)' }}>@{user.username}</span>
          {user.followersCount !== undefined && (
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              {user.followersCount} followers
            </span>
          )}
        </div>
      </div>

      {/* Follow button */}
      {showFollowButton && !isSelf && onFollow && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFollow(user.username);
          }}
          style={{
            padding: '5px 14px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '20px',
            border: user.isFollowing ? '1px solid var(--border-strong)' : '1px solid var(--accent-border)',
            background: user.isFollowing ? 'transparent' : 'var(--accent)',
            color: user.isFollowing ? 'var(--text-soft)' : 'var(--text-inverse)',
            cursor: 'pointer',
            transition: 'all 0.15s',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
          className="hover:opacity-80"
        >
          {user.isFollowing ? 'Following' : 'Follow'}
        </button>
      )}
    </div>
  );
};

export default UserRow;
