import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Onboarding: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const checkTimerRef = React.useRef<number | null>(null);

  const isValid = username.length >= 3 && username.length <= 20;

  const checkUsername = React.useCallback(async (value: string) => {
    if (value.length < 3) {
      setIsAvailable(null);
      setChecking(false);
      return;
    }

    setChecking(true);
    setIsAvailable(null);
    setError('');

    try {
      const response = await api.get(`/auth/check-username?username=${encodeURIComponent(value)}`);
      setIsAvailable(response.data.available);
      if (!response.data.available) {
        setError('That username is already taken.');
      }
    } catch (err) {
      console.error('Failed to check username:', err);
    } finally {
      setChecking(false);
    }
  }, []);

  React.useEffect(() => {
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    
    if (username.length >= 3) {
      checkTimerRef.current = window.setTimeout(() => {
        checkUsername(username);
      }, 500);
    } else {
      setIsAvailable(null);
      setChecking(false);
    }

    return () => {
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    };
  }, [username, checkUsername]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !isAvailable || checking) return;
    setLoading(true);
    setError('');

    try {
      await api.post('/auth/onboard', { username });
      await refreshUser();
      navigate('/feed');
    } catch (err: unknown) {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const axiosError = err as any;
      setError(axiosError.response?.data?.error || 'That username might already be taken.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="theme-page"
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', sans-serif",
        position: 'relative',
        overflow: 'hidden',
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      {/* Ambient glow */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '800px',
          height: '800px',
          background: 'radial-gradient(circle, var(--accent-soft) 0%, transparent 70%)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '20%',
          right: '15%',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, var(--surface-accent) 0%, transparent 70%)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', maxWidth: '440px', position: 'relative', zIndex: 10 }}
      >
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            marginBottom: '40px',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="28" cy="10" r="5" fill="var(--color-yellow)" />
            <circle cx="42" cy="18" r="5" fill="var(--color-orange)" />
            <circle cx="44" cy="34" r="5" fill="var(--accent)" />
            <circle cx="34" cy="46" r="5" fill="var(--color-blue)" />
            <circle cx="18" cy="44" r="5" fill="var(--color-purple)" />
            <circle cx="12" cy="28" r="5" fill="var(--color-pink)" />
            <circle cx="18" cy="16" r="5" fill="var(--color-aqua)" />
            <circle cx="30" cy="28" r="3.5" fill="var(--accent)" />
          </svg>
          <span
            style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: '26px',
              fontWeight: 600,
              letterSpacing: '-0.5px',
              color: 'var(--text)',
            }}
          >
            scholic
          </span>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{
            padding: '40px',
            borderRadius: '28px',
            border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {/* Title */}
          <div style={{ marginBottom: '32px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--accent-soft)',
                border: '1px solid var(--accent-border)',
                borderRadius: '100px',
                padding: '4px 12px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  boxShadow: '0 0 6px var(--accent)',
                }}
              />
              <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.06em' }}>
                ALMOST THERE
              </span>
            </div>

            <h1
              style={{
                fontFamily: 'Outfit, sans-serif',
                fontSize: '28px',
                fontWeight: 700,
                color: 'var(--text)',
                letterSpacing: '-0.5px',
                lineHeight: 1.2,
                margin: '0 0 10px 0',
              }}
            >
              Claim your handle
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--text-dim)', lineHeight: 1.6, margin: 0 }}>
              Pick a username that'll represent you everywhere on scholic.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Input field */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-faint)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                }}
              >
                Username
              </label>

              <div style={{ position: 'relative' }}>
                {/* @ prefix */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '52px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRight: '1px solid var(--border)',
                    pointerEvents: 'none',
                  }}
                >
                  <span style={{ fontSize: '16px', color: 'var(--text-dim)', fontWeight: 500 }}>@</span>
                </div>

                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) =>
                    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                  }
                  placeholder="yourname"
                  style={{
                    width: '100%',
                    background: 'var(--surface-2)',
                    border: `1px solid ${error ? 'var(--danger)' : (isValid && isAvailable) ? 'var(--accent-border)' : 'var(--border)'}`,
                    borderRadius: '14px',
                    padding: '15px 16px 15px 64px',
                    color: 'var(--text)',
                    fontSize: '15px',
                    fontWeight: 500,
                    letterSpacing: '-0.2px',
                    outline: 'none',
                    transition: 'border-color 0.2s, background 0.2s',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                  onFocus={(e) => {
                    if (!error && !isValid) {
                      e.target.style.borderColor = 'var(--border-strong)';
                      e.target.style.background = 'var(--surface-hover)';
                    }
                  }}
                  onBlur={(e) => {
                    if (!error && !isValid) {
                      e.target.style.borderColor = 'var(--border)';
                      e.target.style.background = 'var(--surface-2)';
                    }
                  }}
                />

                {/* Character count / checkmark */}
                <AnimatePresence>
                  {username.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      style={{
                        position: 'absolute',
                        right: '14px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '11px',
                        color: isValid ? 'var(--accent)' : 'var(--text-faint)',
                        fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {checking ? (
                        <span className="pulse" style={{ color: 'var(--accent)' }}>Checking…</span>
                      ) : isAvailable === true ? (
                        <span style={{ color: 'var(--accent)' }}>Available</span>
                      ) : (
                        `${username.length}/20`
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Hint / Error */}
              <AnimatePresence mode="wait">
                {error ? (
                  <motion.p
                    key="error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    style={{
                      fontSize: '12px',
                      color: 'var(--danger)',
                      margin: '2px 0 0 2px',
                    }}
                  >
                    {error}
                  </motion.p>
                ) : (
                  <motion.p
                    key="hint"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-faint)',
                      margin: '2px 0 0 2px',
                    }}
                  >
                    Only lowercase letters, numbers, and underscores.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading || !isValid || !isAvailable || checking}
              style={{
                width: '100%',
                padding: '15px 20px',
                background: (isValid && isAvailable && !loading && !checking) ? 'var(--accent)' : 'var(--accent-soft)',
                border: `1px solid ${(isValid && isAvailable && !loading && !checking) ? 'transparent' : 'var(--accent-soft)'}`,
                borderRadius: '14px',
                color: (isValid && isAvailable && !loading && !checking) ? 'var(--text-inverse)' : 'var(--text-dim)',
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '-0.1px',
                cursor: (isValid && isAvailable && !loading && !checking) ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                boxShadow: isValid && !loading ? '0 8px 24px var(--accent-soft)' : 'none',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => {
                if (isValid && !loading) {
                  (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.08)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.filter = '';
                (e.currentTarget as HTMLButtonElement).style.transform = '';
              }}
              onMouseDown={(e) => {
                if (isValid && !loading) {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.99)';
                }
              }}
              onMouseUp={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = '';
              }}
            >
              {loading ? (
                <span className="pulse">Claiming…</span>
              ) : (
                <>
                  Continue
                  <ArrowRight style={{ width: '15px', height: '15px' }} />
                </>
              )}
            </button>
          </form>

          {/* Divider + signed in as */}
          <div style={{ marginTop: '28px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent-soft), var(--surface-2))',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  color: 'var(--text-soft)',
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {user?.email?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '10px', color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 2px 0' }}>
                  Signed in as
                </p>
                <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: var(--text-faint); }
      `}</style>
    </div>
  );
};

export default Onboarding;
