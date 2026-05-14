import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, AlertTriangle, Sparkles } from 'lucide-react';

type Status = 'loading' | 'syncing' | 'success' | 'error';

const statusConfig: Record<Status, {
  icon: React.ReactNode;
  ringColor: string;
  bgColor: string;
  title: string;
  description: string;
  accent: string;
}> = {
  loading: {
    icon: <Sparkles style={{ width: 28, height: 28, color: 'var(--color-aqua)' }} className="pulse" />,
    ringColor: 'var(--color-aqua-ring)',
    bgColor: 'var(--color-aqua-soft)',
    accent: 'var(--color-aqua)',
    title: 'Checking authentication…',
    description: 'Verifying your session before proceeding.',
  },
  syncing: {
    icon: <Sparkles style={{ width: 28, height: 28, color: 'var(--accent)' }} className="pulse" />,
    ringColor: 'var(--accent-soft)',
    bgColor: 'var(--accent-soft)',
    accent: 'var(--accent)',
    title: 'Syncing with Scholic…',
    description: 'Securely passing your credentials to the extension.',
  },
  success: {
    icon: <ShieldCheck style={{ width: 28, height: 28, color: 'var(--accent)' }} />,
    ringColor: 'var(--accent-border)',
    bgColor: 'var(--accent-soft)',
    accent: 'var(--accent)',
    title: 'Ready to annotate',
    description: 'Your extension is connected. You can close this tab and return to your page.',
  },
  error: {
    icon: <AlertTriangle style={{ width: 28, height: 28, color: 'var(--color-pink)' }} />,
    ringColor: 'var(--color-pink-soft)',
    bgColor: 'var(--color-pink-soft)',
    accent: 'var(--color-pink)',
    title: 'Sync failed',
    description: 'We couldn\'t reach the Scholic extension. Make sure it\'s installed and enabled, then try again.',
  },
};

const ExtensionLogin: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const [searchParams] = useSearchParams();

  const extensionId = searchParams.get('extId') || 'cmoigjmnpjbbmkbphmhkjphfocmcmmhl';

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      window.location.href = `/?redirect=/auth/extension-login?extId=${extensionId}`;
      return;
    }

    const syncToken = async () => {
      setStatus('syncing');
      try {
        const response = await api.get('/auth/token');
        const token = response.data.token;

        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const chrome = (window as any).chrome;
        if (chrome?.runtime?.sendMessage) {
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          chrome.runtime.sendMessage(extensionId, { type: 'SCHOLIC_EXT_AUTH', token }, (response: any) => {
            if (chrome.runtime.lastError || response?.error) {
              setStatus('error');
            } else {
              setStatus('success');
              setTimeout(() => window.close(), 2000);
            }
          });
        } else {
          setStatus('error');
        }
      } catch {
        setStatus('error');
      }
    };

    syncToken();
  }, [user, authLoading, extensionId]);

  const config = statusConfig[status];

  return (
    <div
      className="theme-page"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: "'Inter', sans-serif",
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient glow — follows status accent color */}
      <AnimatePresence mode="wait">
        <motion.div
          key={status}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -60%)',
            width: '600px',
            height: '600px',
            background: `radial-gradient(circle, ${config.ringColor} 0%, transparent 70%)`,
            borderRadius: '50%',
            pointerEvents: 'none',
            filter: 'blur(40px)',
          }}
        />
      </AnimatePresence>

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '36px',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <svg width="28" height="28" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
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
            fontSize: '22px',
            fontWeight: 600,
            letterSpacing: '-0.4px',
            color: 'var(--text)',
          }}
        >
          scholic
        </span>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{
          maxWidth: '400px',
          width: '100%',
          padding: '40px',
          borderRadius: '28px',
          border: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: 'var(--shadow-lg)',
          position: 'relative',
          zIndex: 10,
          textAlign: 'center',
        }}
      >
        {/* Icon */}
        <AnimatePresence mode="wait">
          <motion.div
            key={status}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: config.bgColor,
              border: `1px solid ${config.ringColor}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 28px',
              boxShadow: `0 0 32px ${config.ringColor}`,
            }}
          >
            {config.icon}
          </motion.div>
        </AnimatePresence>

        {/* Title */}
        <AnimatePresence mode="wait">
          <motion.h1
            key={`title-${status}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: '24px',
              fontWeight: 700,
              color: 'var(--text)',
              letterSpacing: '-0.4px',
              margin: '0 0 12px 0',
              lineHeight: 1.2,
            }}
          >
            {config.title}
          </motion.h1>
        </AnimatePresence>

        {/* Description */}
        <AnimatePresence mode="wait">
          <motion.p
            key={`desc-${status}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            style={{
              fontSize: '14px',
              color: 'var(--text-dim)',
              lineHeight: 1.65,
              margin: '0 0 28px 0',
            }}
          >
            {config.description}
          </motion.p>
        </AnimatePresence>

        {/* Status pill */}
        <AnimatePresence>
          {(status === 'loading' || status === 'syncing') && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                background: `${config.bgColor}`,
                border: `1px solid ${config.ringColor}`,
                borderRadius: '100px',
                padding: '7px 14px',
              }}
            >
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: config.accent,
                  boxShadow: `0 0 6px ${config.accent}`,
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
              <span style={{ fontSize: '12px', color: config.accent, fontWeight: 600, letterSpacing: '0.04em' }}>
                {status === 'loading' ? 'Verifying session' : 'Connecting extension'}
              </span>
            </motion.div>
          )}

          {status === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                background: 'var(--accent-soft)',
                border: '1px solid var(--accent-border)',
                borderRadius: '100px',
                padding: '7px 14px',
              }}
            >
              <Sparkles style={{ width: 13, height: 13, color: 'var(--accent)' }} />
              <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>
                Connected successfully
              </span>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => window.location.reload()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                background: 'var(--color-pink-soft)',
                border: '1px solid var(--color-pink-border)',
                borderRadius: '100px',
                padding: '9px 18px',
                color: 'var(--color-pink)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'filter 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.15)')}
              onMouseLeave={(e) => (e.currentTarget.style.filter = '')}
            >
              Try again
            </motion.button>
          )}
        </AnimatePresence>

        {/* Footer - user email */}
        {user?.email && (
          <div
            style={{
              marginTop: '32px',
              paddingTop: '24px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                background: 'var(--avatar-gradient-soft)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                color: 'var(--text-soft)',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {user.email[0].toUpperCase()}
            </div>
            <span style={{ fontSize: '13px', color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email}
            </span>
          </div>
        )}
      </motion.div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};

export default ExtensionLogin;
