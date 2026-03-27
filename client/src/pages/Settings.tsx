import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import { ArrowLeft, Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Settings: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('Profile');
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

  const tabs = ['Profile', 'Privacy', 'Integrations', 'Security'];

  const initial = user?.username?.[0]?.toUpperCase() || user?.firstName?.[0]?.toUpperCase() || '?';

  return (
    <div className="min-h-screen w-full" style={{ ...bodyFont, background: '#121212', color: '#fff' }}>
      <Navbar />

      <div className="mx-auto" style={{ maxWidth: '640px', padding: '32px 20px', margin: '0 auto' }}>
        {/* Header: back arrow + title + save */}
        <div className="flex items-center justify-between" style={{ marginBottom: '24px' }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-1 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" style={{ color: '#999' }} />
            </button>
            <h1 className="font-semibold" style={{ fontSize: '20px' }}>Settings</h1>
          </div>
          <div className="flex items-center gap-3">
            {saveMessage && (
              <span style={{ fontSize: '12px', color: saveMessage === 'Saved!' ? '#6EB781' : '#e87347' }}>
                {saveMessage}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="font-semibold transition-all cursor-pointer hover:brightness-110"
              style={{
                backgroundColor: '#6EB781',
                color: '#fff',
                padding: '6px 20px',
                fontSize: '13px',
                borderRadius: '8px',
                border: 'none',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '28px' }}>
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="transition-colors cursor-pointer"
              style={{
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 500,
                color: activeTab === tab ? '#6EB781' : '#666',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #6EB781' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Profile Tab Content */}
        {activeTab === 'Profile' && (
          <div>
            {/* Avatar */}
            <div className="flex items-center gap-4" style={{ marginBottom: '28px' }}>
              <div
                className="relative flex items-center justify-center overflow-hidden"
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  background: user?.profilePicture ? 'transparent' : 'linear-gradient(135deg, rgba(110,183,129,0.3), rgba(71,163,232,0.3))',
                  border: '2px solid rgba(110,183,129,0.3)',
                  fontSize: '20px',
                  fontWeight: 700,
                  color: '#fff',
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
                className="flex items-center gap-2 transition-colors cursor-pointer hover:bg-white/5"
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#ccc',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
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
                <label style={{ fontSize: '12px', color: '#888', display: 'block', marginBottom: '6px' }}>
                  Display Name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  maxLength={100}
                  placeholder="Your name"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    color: '#e0e0e0',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#888', display: 'block', marginBottom: '6px' }}>
                  Username
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    readOnly
                    value={username}
                    placeholder="username"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '13px',
                      color: '#666',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      borderRadius: '8px',
                      outline: 'none',
                      boxSizing: 'border-box',
                      cursor: 'not-allowed',
                    }}
                  />
                  <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: '#444' }}>
                    Locked
                  </span>
                </div>
              </div>
            </div>

            {/* Locked Email Address */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', color: '#888', display: 'block', marginBottom: '6px' }}>
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  readOnly
                  value={user?.email || ''}
                  placeholder="email@example.com"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    color: '#666',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '8px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    cursor: 'not-allowed',
                  }}
                />
                <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: '#444' }}>
                  Locked
                </span>
              </div>
            </div>

            {/* Show Member Number */}
            <div
              className="flex items-center justify-between"
              style={{
                padding: '14px 0',
                borderTop: '1px solid rgba(255,255,255,0.04)',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                marginBottom: '20px',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#e0e0e0' }}>Show Member Number</div>
                <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
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
                    background: showMemberNumber ? '#6EB781' : 'rgba(255,255,255,0.1)',
                    transition: 'background 0.2s',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: '#fff',
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
              <label style={{ fontSize: '12px', color: '#888', display: 'block', marginBottom: '6px' }}>
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => { if (e.target.value.length <= 280) setBio(e.target.value); }}
                placeholder="Tell us about yourself..."
                maxLength={280}
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '13px',
                  color: '#e0e0e0',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        )}

        {/* Other tabs — coming soon */}
        {activeTab !== 'Profile' && (
          <div className="flex items-center justify-center" style={{ padding: '60px 0', color: '#444' }}>
            <p style={{ fontSize: '14px' }}>{activeTab} settings coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
