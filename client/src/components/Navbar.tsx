import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Search } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const brandFont = { fontFamily: '"Outfit", sans-serif' };

  const initial = user?.username?.[0]?.toUpperCase() || user?.firstName?.[0]?.toUpperCase() || '?';

  return (
    <nav
      className="w-full relative flex items-center justify-center"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', height: '48px', padding: '0 40px' }}
    >
      {/* Center: brand + search */}
      <div className="flex items-center gap-2">
        <span
          className="font-semibold cursor-pointer"
          style={{ ...brandFont, fontSize: '18px', color: '#fff', letterSpacing: '-0.3px' }}
          onClick={() => navigate('/feed')}
        >
          <span style={{ color: '#6EB781' }}>#</span>scholic
        </span>
        <button className="p-1 rounded-full hover:bg-white/5 transition-colors cursor-pointer">
          <Search className="w-3.5 h-3.5" style={{ color: '#555' }} />
        </button>
      </div>

      {/* Right side: actions */}
      <div className="absolute right-10 flex items-center gap-4">
        {user && (
          <>
            <button
              onClick={logout}
              className="text-xs transition-colors cursor-pointer hover:text-white"
              style={{ color: '#777' }}
            >
              Sign out
            </button>
            <button
              onClick={() => navigate(`/u/${user.username}`)}
              className="flex items-center justify-center rounded-full overflow-hidden cursor-pointer transition-opacity hover:opacity-80"
              style={{
                width: '28px',
                height: '28px',
                background: user.profilePicture ? 'transparent' : 'linear-gradient(135deg, rgba(110,183,129,0.5), rgba(71,163,232,0.5))',
                fontSize: '11px',
                fontWeight: 700,
                color: '#fff',
                border: location.pathname === `/u/${user.username}` ? '2px solid #6EB781' : '2px solid transparent',
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
            </button>
          </>
        )}
        {!user && (
          <button
            onClick={() => navigate('/')}
            className="text-xs font-semibold px-4 py-1.5 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
            style={{ color: '#6EB781', border: '1px solid rgba(110,183,129,0.3)' }}
          >
            Sign in
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
