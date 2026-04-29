import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Search } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import SearchModal from './SearchModal';
import NotificationsMenu from './NotificationsMenu';

const Navbar: React.FC = () => {
  const { user, logout, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);

  // Derive scope: if we're on a profile page /u/:username, scope search to that user
  const profileMatch = location.pathname.match(/^\/u\/([^/]+)/);
  const scopeUsername = profileMatch ? profileMatch[1] : undefined;

  const brandFont = { fontFamily: '"Outfit", sans-serif' };

  const initial = user?.username?.[0]?.toUpperCase() || user?.firstName?.[0]?.toUpperCase() || '?';

  const toggleSearch = useCallback(() => setSearchOpen(prev => !prev), []);

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleSearch();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleSearch]);

  return (
    <>
      <nav
        className="w-full relative flex items-center justify-center"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', height: '48px', padding: '0 40px' }}
      >
        {/* Center: brand + search */}
        <div className="flex items-center gap-3">
          <span
            className="font-semibold cursor-pointer"
            style={{ ...brandFont, fontSize: '18px', color: '#fff', letterSpacing: '-0.3px' }}
            onClick={() => navigate('/feed')}
          >
            <span style={{ color: '#6EB781' }}>#</span>scholic
          </span>
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 cursor-pointer transition-colors"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '8px',
              padding: '4px 10px 4px 8px',
              color: '#444',
              fontSize: '12px',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLButtonElement).style.color = '#666'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#444'; }}
          >
            <Search style={{ width: 12, height: 12 }} />
            <span>Search</span>
            <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#333', background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '1px 5px', marginLeft: 2 }}>⌘K</span>
          </button>
        </div>

        {/* Right side: actions */}
        <div className="absolute right-10 flex items-center gap-4">
          {user && (
            <>
              <NotificationsMenu />
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
              onClick={login}
              className="text-xs font-semibold px-4 py-1.5 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
              style={{ color: '#6EB781', border: '1px solid rgba(110,183,129,0.3)' }}
            >
              Sign in
            </button>
          )}
        </div>
      </nav>

      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        currentUserId={user?.id}
        scopeUsername={scopeUsername}
      />
    </>
  );
};

export default Navbar;
