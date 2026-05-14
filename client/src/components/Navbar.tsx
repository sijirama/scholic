import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Moon, Search, SunMedium } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import SearchModal from './SearchModal';
import NotificationsMenu from './NotificationsMenu';
import { useTheme } from '../contexts/ThemeContext';

const Navbar: React.FC = () => {
  const { user, logout, login } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--nav-bg)',
          backdropFilter: 'blur(18px)',
          height: '48px',
          padding: '0 40px',
        }}
      >
        {/* Center: brand + search */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/discover')}
            className="cursor-pointer transition-colors"
            style={{
              background: 'transparent',
              border: 'none',
              color: location.pathname === '/discover' ? 'var(--text)' : 'var(--text-dim)',
              fontSize: '13px',
              fontWeight: location.pathname === '/discover' ? 600 : 500,
              fontFamily: 'inherit',
              padding: '4px 6px',
            }}
          >
            Discover
          </button>
          <span
            className="font-semibold cursor-pointer"
            style={{ ...brandFont, fontSize: '18px', color: 'var(--text)', letterSpacing: '-0.3px' }}
            onClick={() => navigate('/feed')}
          >
            <span style={{ color: 'var(--accent)' }}>#</span>scholic
          </span>
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 cursor-pointer transition-colors"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '4px 10px 4px 8px',
              color: 'var(--text-dim)',
              fontSize: '12px',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-soft)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-dim)';
            }}
          >
            <Search style={{ width: 12, height: 12 }} />
            <span>Search</span>
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'monospace',
                color: 'var(--text-faint)',
                background: 'var(--surface-3)',
                borderRadius: 4,
                padding: '1px 5px',
                marginLeft: 2,
              }}
            >
              ⌘K
            </span>
          </button>
        </div>

        {/* Right side: actions */}
        <div className="absolute right-10 flex items-center gap-4">
          <button
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="theme-icon-button flex items-center justify-center rounded-full cursor-pointer"
            style={{ width: '30px', height: '30px' }}
          >
            {theme === 'dark' ? <SunMedium style={{ width: 15, height: 15 }} /> : <Moon style={{ width: 15, height: 15 }} />}
          </button>
          {user && (
            <>
              <NotificationsMenu />
              <button
                onClick={logout}
                className="text-xs transition-colors cursor-pointer"
                style={{ color: 'var(--text-dim)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-dim)';
                }}
              >
                Sign out
              </button>
              <button
                onClick={() => navigate(`/u/${user.username}`)}
                className="flex items-center justify-center rounded-full overflow-hidden cursor-pointer transition-opacity hover:opacity-80"
                style={{
                  width: '28px',
                  height: '28px',
                  background: user.profilePicture ? 'transparent' : 'var(--avatar-gradient)',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-inverse)',
                  border: location.pathname === `/u/${user.username}` ? '2px solid var(--accent)' : '2px solid transparent',
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
              className="transition-colors cursor-pointer"
              style={{
                padding: '8px 16px',
                minHeight: '34px',
                borderRadius: '999px',
                border: '1px solid var(--border-strong)',
                background: 'var(--bg-elevated)',
                color: 'var(--text)',
                fontSize: '12px',
                fontWeight: 650,
                lineHeight: 1,
                boxShadow: 'var(--shadow-sm)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface-hover)';
                e.currentTarget.style.borderColor = 'var(--accent-border)';
                e.currentTarget.style.color = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-elevated)';
                e.currentTarget.style.borderColor = 'var(--border-strong)';
                e.currentTarget.style.color = 'var(--text)';
              }}
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
