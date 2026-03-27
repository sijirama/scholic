import React from 'react';

interface AvatarProps {
  user: {
    username?: string;
    firstName?: string;
    profilePicture?: string;
  };
  size?: number;
}

const Avatar: React.FC<AvatarProps> = ({ user, size = 36 }) => {
  const initial = user.username?.[0]?.toUpperCase() || user.firstName?.[0]?.toUpperCase() || '?';

  if (user.profilePicture) {
    return (
      <img
        src={user.profilePicture}
        alt={user.username || ''}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, rgba(110,183,129,0.5), rgba(71,163,232,0.5))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontWeight: 700,
        color: '#fff',
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
};

export default React.memo(Avatar);
