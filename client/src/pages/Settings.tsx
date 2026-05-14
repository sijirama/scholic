import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import { ArrowLeft, Camera, Moon, SunMedium } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';

const Settings: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Profile fields
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState('');
  const [showMemberNumber, setShowMemberNumber] = useState(true);
  const [memberNumber, setMemberNumber] = useState(0);

  // Avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const bodyFont = { fontFamily: '"Inter", sans-serif' };

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setUsername(user.username || '');
      // Fetch full profile for extra fields
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      const response = await api.get('/auth/me');
      const data = response.data;
      setBio(data.bio || '');
      setShowMemberNumber(data.showMemberNumber ?? true);
      setMemberNumber(data.memberNumber || 0);
    } catch (e) {
      console.error('Failed to fetch profile:', e);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      await api.put('/auth/profile', {
        firstName,
        lastName,
        bio,
        showMemberNumber,
      });
      await refreshUser();
      setSaveMessage('Saved!');
      setTimeout(() => setSaveMessage(''), 2000);
    } catch (err: unknown) {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const axiosError = err as any;
      const msg = axiosError.response?.data?.error || 'Failed to save';
      setSaveMessage(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      await api.post('/upload/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await refreshUser();
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const initial = user?.username?.[0]?.toUpperCase() || user?.firstName?.[0]?.toUpperCase() || '?';

  return (
    <div className="theme-page" style={{ ...bodyFont }}>
      <Navbar />

      <div className="mx-auto" style={{ maxWidth: '640px', padding: '32px 20px', margin: '0 auto' }}>
        {/* Header: back arrow + title + save */}
        <div className="flex items-center justify-between" style={{ marginBottom: '24px' }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-1 rounded-md transition-colors cursor-pointer theme-icon-button"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="font-semibold" style={{ fontSize: '20px' }}>Settings</h1>
          </div>
          <div className="flex items-center gap-3">
            {saveMessage && (
              <span style={{ fontSize: '12px', color: saveMessage === 'Saved!' ? 'var(--accent)' : 'var(--danger)' }}>
                {saveMessage}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="font-semibold transition-all cursor-pointer theme-button-primary"
              style={{
                padding: '6px 20px',
                fontSize: '13px',
                borderRadius: '8px',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        <div>
            {/* Avatar */}
            <div className="flex items-center gap-4" style={{ marginBottom: '28px' }}>
              <div
                className="relative flex items-center justify-center overflow-hidden"
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  background: user?.profilePicture ? 'transparent' : 'var(--avatar-gradient-soft)',
                  border: '2px solid var(--accent-border)',
                  fontSize: '20px',
                  fontWeight: 700,
                  color: 'var(--text-inverse)',
                }}
              >
                {user?.profilePicture ? (
                  <img
                    src={user.profilePicture}
                    alt="Avatar"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  initial
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 transition-colors cursor-pointer theme-button-secondary"
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 500,
                  borderRadius: '8px',
                }}
              >
                <Camera className="w-3.5 h-3.5" />
                {uploading ? 'Uploading...' : 'Change'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>

            {/* Display Name & Username */}
            <div className="grid grid-cols-2 gap-4" style={{ marginBottom: '20px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-soft)', display: 'block', marginBottom: '6px' }}>
                  Display Name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  maxLength={100}
                  placeholder="Your name"
                  className="theme-input"
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-soft)', display: 'block', marginBottom: '6px' }}>
                  Username
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    readOnly
                    value={username}
                    placeholder="username"
                    className="theme-input"
                  />
                  <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-faint)' }}>
                    Locked
                  </span>
                </div>
              </div>
            </div>

            {/* Locked Email Address */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-soft)', display: 'block', marginBottom: '6px' }}>
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  readOnly
                  value={user?.email || ''}
                  placeholder="email@example.com"
                  className="theme-input"
                />
                <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-faint)' }}>
                  Locked
                </span>
              </div>
            </div>

            <div
              className="flex items-center justify-between"
              style={{
                padding: '14px 0',
                borderTop: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
                marginBottom: '20px',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>Appearance</div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                  Choose how Scholic looks for you
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTheme('light')}
                  className={theme === 'light' ? 'theme-pill' : 'theme-button-secondary'}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  <SunMedium className="w-3.5 h-3.5" />
                  Light
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={theme === 'dark' ? 'theme-pill' : 'theme-button-secondary'}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  <Moon className="w-3.5 h-3.5" />
                  Dark
                </button>
              </div>
            </div>

            {/* Show Member Number */}
            <div
              className="flex items-center justify-between"
              style={{
                padding: '14px 0',
                borderTop: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
                marginBottom: '20px',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>Show Member Number</div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                  Display #{memberNumber || '—'} badge on your profile
                </div>
              </div>
              <label
                className="relative cursor-pointer"
                style={{ display: 'inline-flex', alignItems: 'center' }}
              >
                <input
                  type="checkbox"
                  checked={showMemberNumber}
                  onChange={(e) => setShowMemberNumber(e.target.checked)}
                  className="hidden"
                />
                <div
                  style={{
                    width: '36px',
                    height: '20px',
                    borderRadius: '10px',
                    background: showMemberNumber ? 'var(--accent)' : 'var(--surface-active)',
                    transition: 'background 0.2s',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: 'var(--text-inverse)',
                      position: 'absolute',
                      top: '2px',
                      left: showMemberNumber ? '18px' : '2px',
                      transition: 'left 0.2s',
                    }}
                  />
                </div>
              </label>
            </div>

            {/* Bio */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-soft)', display: 'block', marginBottom: '6px' }}>
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => { if (e.target.value.length <= 280) setBio(e.target.value); }}
                placeholder="Tell us about yourself..."
                maxLength={280}
                rows={3}
                className="theme-textarea"
              />
            </div>
          </div>

      </div>
    </div>
  );
};

export default Settings;
