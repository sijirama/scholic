import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Search, ChevronRight } from 'lucide-react';

const Landing: React.FC = () => {
  const { login } = useAuth();

  const brandFont = { fontFamily: '"Outfit", sans-serif' };
  const bodyFont = { fontFamily: '"Inter", sans-serif' };

  return (
    <div className="min-h-screen w-full" style={{ ...bodyFont, background: '#121212', color: '#fff' }}>

      {/* ── Navigation ── */}
      <nav
        className="w-full relative flex items-center justify-center"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', height: '48px', padding: '0 40px' }}
      >
        {/* Center: brand + search */}
        <div className="flex items-center gap-2">
          <span className="font-semibold" style={{ ...brandFont, fontSize: '18px', color: '#fff', letterSpacing: '-0.3px' }}>
            <span style={{ color: '#6EB781' }}>#</span>scholic
          </span>
          <button className="p-1 rounded-full hover:bg-white/5 transition-colors cursor-pointer">
            <Search className="w-3.5 h-3.5" style={{ color: '#555' }} />
          </button>
        </div>

        {/* Right: login — flush with nav height, less rounded */}
        <button
          onClick={login}
          className="absolute right-10 font-semibold transition-all cursor-pointer hover:brightness-110"
          style={{
            backgroundColor: '#6EB781',
            color: '#e0e0e0',
            padding: '4px 14px',
            fontSize: '12px',
            borderRadius: '6px',
          }}
        >
          Log In
        </button>
      </nav>

      {/* ── Hero Section ── */}
      <section className="flex flex-col items-center justify-center text-center px-6"
        style={{ paddingTop: '80px', paddingBottom: '60px' }}
      >

        {/* Brand: icon left of text, text stays centered */}
        <div className="flex items-center justify-center" style={{ marginBottom: '24px' }}>
          {/* Logo container with 0 width to not affect centering */}
          <div style={{ width: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', overflow: 'visible' }}>
            <svg 
              width="48" height="48" viewBox="0 0 56 56" fill="none" 
              xmlns="http://www.w3.org/2000/svg" 
              style={{ marginRight: '4px', flexShrink: 0 }}
            >
              <circle cx="28" cy="10" r="5" fill="#E8C547" />
              <circle cx="42" cy="18" r="5" fill="#E87347" />
              <circle cx="44" cy="34" r="5" fill="#6EB781" />
              <circle cx="34" cy="46" r="5" fill="#47A3E8" />
              <circle cx="18" cy="44" r="5" fill="#9B6EB7" />
              <circle cx="12" cy="28" r="5" fill="#E8477A" />
              <circle cx="18" cy="16" r="5" fill="#47E8C5" />
              <circle cx="30" cy="28" r="3.5" fill="#6EB781" />
            </svg>
          </div>
          <span
            className="font-bold inline-flex items-center"
            style={{ ...brandFont, fontSize: '66px', letterSpacing: '-3px', lineHeight: 1, color: '#6EB781' }}
          >
            scholic
          </span>
        </div>

        {/* Tagline */}
        <h2
          className="font-medium"
          style={{ ...brandFont, fontSize: '22px', color: '#e0e0e0', letterSpacing: '0.2px', marginBottom: '14px' }}
        >
          A Social Annotation Platform.
        </h2>

        {/* Description — wider to fit 3 lines */}
        <p
          className="leading-relaxed"
          style={{ fontSize: '16px', color: '#999', maxWidth: '580px', marginBottom: '36px' }}
        >
          Highlight any passage on the web, share your perspective, and discover
          what others are thinking. Scholic turns every page into a conversation
          and every reader into a collaborator.
        </p>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          <button
            onClick={login}
            className="flex items-center gap-1.5 font-semibold transition-all cursor-pointer hover:brightness-110"
            style={{
              backgroundColor: '#6EB781',
              color: '#e0e0e0',
              padding: '11px 28px',
              fontSize: '14px',
              borderRadius: '10px',
            }}
          >
            Get Started
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            className="flex items-center gap-2 font-medium transition-all cursor-pointer hover:bg-white/5"
            style={{
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#ddd',
              padding: '11px 28px',
              fontSize: '14px',
              borderRadius: '10px',
              background: 'transparent',
            }}
          >
            {/* Official Chrome icon */}
            <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill="#EA4335" d="M24 11c5.2 0 9.5 3.3 11 8h12.5C45 8.3 35.5 0 24 0 14.8 0 6.9 5.3 3.1 13l6.4 11.2c1.3-7.4 7.7-13.2 14.5-13.2z"/>
              <path fill="#FBBC05" d="M11.3 24l-6.4-11.2C1.8 16.3 0 20 0 24c0 11.1 7.5 20.4 17.7 23.1l6.4-11.2c-7.3-.6-12.8-6.1-12.8-11.9z"/>
              <path fill="#34A853" d="M24 37c-5.2 0-9.5-3.3-11-8L6.6 40.2C10.4 44.9 16.8 48 24 48c11.1 0 20.4-7.5 23.1-17.7H34.5c-1.3 3.8-5 6.7-10.5 6.7z"/>
              <circle fill="#FFF" cx="24" cy="24" r="12"/>
              <circle fill="#4285F4" cx="24" cy="24" r="9"/>
            </svg>
            Add to Chrome
          </button>
        </div>
      </section>

      {/* ── Mock Screen Section ── */}
      <section className="flex justify-center px-6" style={{ paddingBottom: '100px' }}>
        <div
          style={{
            width: '100%',
            maxWidth: '900px',
            aspectRatio: '16 / 10',
            background: '#1a1a1a',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.08)',
            overflow: 'hidden',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          }}
        >
          {/* Browser chrome */}
          <div
            className="flex items-center gap-2"
            style={{ padding: '10px 16px', background: '#161616', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex gap-1.5">
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
            </div>
            <div
              className="flex-1 mx-4"
              style={{ background: '#0f0f0f', borderRadius: '6px', padding: '5px 12px', fontSize: '11px', color: '#555' }}
            >
              scholic.app/feed
            </div>
          </div>

          {/* App content mock */}
          <div className="flex h-full">
            {/* Sidebar */}
            <div style={{ width: '200px', background: '#141414', borderRight: '1px solid rgba(255,255,255,0.05)', padding: '20px 16px' }}>
              <div className="flex items-center gap-2 mb-6">
                <div style={{ width: 24, height: 24, borderRadius: 6, background: '#6EB781' }} />
                <span style={{ ...brandFont, fontSize: 13, fontWeight: 600, color: '#ccc' }}>Scholic</span>
              </div>
              {['Dashboard', 'Annotations', 'Collections', 'Explore', 'Settings'].map((item, i) => (
                <div
                  key={item}
                  className="flex items-center gap-2"
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    marginBottom: 2,
                    fontSize: 13,
                    color: i === 1 ? '#6EB781' : '#666',
                    background: i === 1 ? 'rgba(110,183,129,0.1)' : 'transparent',
                  }}
                >
                  <div style={{ width: 14, height: 14, borderRadius: 4, background: i === 1 ? '#6EB781' : '#333' }} />
                  {item}
                </div>
              ))}
            </div>

            {/* Main content */}
            <div style={{ flex: 1, padding: '24px 32px' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#ddd', marginBottom: 20 }}>Web Annotations</div>
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  style={{
                    background: '#161616',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 10,
                    padding: '16px 20px',
                    marginBottom: 12,
                  }}
                >
                  <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#252525' }} />
                    <div>
                      <div style={{ width: 80, height: 8, borderRadius: 4, background: '#333' }} />
                      <div style={{ width: 50, height: 6, borderRadius: 4, background: '#222', marginTop: 4 }} />
                    </div>
                  </div>
                  <div style={{ borderLeft: '2px solid #6EB781', paddingLeft: 12, margin: '8px 0' }}>
                    <div style={{ width: '90%', height: 7, borderRadius: 4, background: '#252525', marginBottom: 6 }} />
                    <div style={{ width: '70%', height: 7, borderRadius: 4, background: '#252525' }} />
                  </div>
                  <div style={{ width: '60%', height: 6, borderRadius: 4, background: '#1e1e1e', marginTop: 10 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing;
