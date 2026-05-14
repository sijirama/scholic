import React from 'react';
import { useNavigate } from 'react-router-dom';

const EFFECTIVE_DATE = 'March 28, 2025';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ marginBottom: 48 }}>
    <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 16, letterSpacing: '-0.2px' }}>
      {title}
    </h2>
    <div style={{ fontSize: 15, color: 'var(--text-soft)', lineHeight: 1.8 }}>
      {children}
    </div>
  </section>
);

const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p style={{ margin: '0 0 12px' }}>{children}</p>
);

const Ul: React.FC<{ items: string[] }> = ({ items }) => (
  <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
    {items.map((item, i) => (
      <li key={i} style={{ marginBottom: 6 }}>{item}</li>
    ))}
  </ul>
);

const Privacy: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="theme-page" style={{ fontFamily: '"Inter", sans-serif' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid var(--border)', height: 48, display: 'flex', alignItems: 'center', padding: '0 40px' }}>
        <span
          onClick={() => navigate('/')}
          style={{ fontFamily: '"Outfit", sans-serif', fontSize: 18, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.3px', cursor: 'pointer' }}
        >
          <span style={{ color: 'var(--accent)' }}>#</span>scholic
        </span>
      </nav>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '64px 40px 120px' }}>
        {/* Header */}
        <div style={{ marginBottom: 56 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.5px', margin: '0 0 12px' }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-faint)', margin: 0 }}>Effective {EFFECTIVE_DATE}</p>
        </div>

        <Section title="Overview">
          <P>
            Scholic is a web annotation platform. We built it to let people highlight, annotate, and share ideas across the web. This policy explains what data we collect, why we collect it, and how we handle it.
          </P>
          <P>
            We collect only what we need to make the product work. We do not sell your data. We do not show ads.
          </P>
        </Section>

        <Section title="What we collect">
          <P><strong style={{ color: 'var(--text-muted)' }}>Account information</strong></P>
          <P>
            When you sign in with Google, we receive your name, email address, and profile picture from Google. We store your name and profile picture to display on your public profile. Your email is used only for account identification and is never shown publicly.
          </P>

          <P><strong style={{ color: 'var(--text-muted)' }}>Annotations</strong></P>
          <P>
            When you create an annotation, we store:
          </P>
          <Ul items={[
            'The highlighted text (quote)',
            'Your note, if you added one',
            'The URL of the page where the annotation was made',
            'The page title, domain, and favicon of that URL',
            'The highlight color you chose',
            'Whether the annotation is public or private',
            'The date and time it was created',
            'Screenshots, if you used the screenshot annotation feature (stored in Cloudflare R2)',
          ]} />

          <P><strong style={{ color: 'var(--text-muted)' }}>Profile information</strong></P>
          <P>
            Your username, display name, bio, and profile picture are public and visible to anyone on Scholic. You can edit or remove them at any time in Settings.
          </P>

          <P><strong style={{ color: 'var(--text-muted)' }}>Browser extension</strong></P>
          <P>
            The Scholic browser extension stores your authentication token locally in your browser using Chrome's storage API. This token is used to authenticate requests to our API. It is never sent to any third party. The extension reads the URL of the page you are currently visiting only to fetch annotations for that page — this data is not logged or stored on our servers.
          </P>

          <P><strong style={{ color: 'var(--text-muted)' }}>Follow relationships</strong></P>
          <P>
            When you follow another user, we store that relationship so we can build your feed and show follower counts on profiles.
          </P>
        </Section>

        <Section title="What we do not collect">
          <Ul items={[
            'Your full browsing history — the extension only reads the current page URL when you interact with it',
            'Payment information — Scholic is currently free',
            'Location data',
            'Device identifiers beyond what your browser sends in a standard HTTP request',
          ]} />
        </Section>

        <Section title="How we use your data">
          <Ul items={[
            'To display your annotations and profile to you and, where public, to other users',
            'To build your feed from annotations made by people you follow',
            'To power search across public annotations and user profiles',
            'To authenticate you across sessions via the browser extension',
          ]} />
          <P>
            We do not use your data for advertising, profiling, or any purpose beyond operating the product.
          </P>
        </Section>

        <Section title="Public vs. private annotations">
          <P>
            Annotations are <strong style={{ color: 'var(--text-muted)' }}>public by default</strong>. Public annotations are visible to anyone — signed in or not — and appear in search results, user profiles, and the feed.
          </P>
          <P>
            You can mark any annotation as <strong style={{ color: 'var(--text-muted)' }}>private</strong> when creating or editing it. Private annotations are visible only to you when signed in. They do not appear in search results or on your public profile.
          </P>
        </Section>

        <Section title="Data sharing">
          <P>
            We do not sell your data. We do not share your data with advertisers or data brokers.
          </P>
          <P>
            We use the following third-party services to operate Scholic:
          </P>
          <Ul items={[
            "Google OAuth — for sign-in. Google's privacy policy applies to the sign-in flow.",
            'Cloudflare R2 — for storing screenshot images. Images are stored securely and served via our API.',
          ]} />
          <P>
            We may disclose data if required by law or to protect the rights and safety of our users.
          </P>
        </Section>

        <Section title="Data retention and deletion">
          <P>
            Your annotations, profile, and account data are retained for as long as your account exists.
          </P>
          <P>
            To delete your account and all associated data, contact us at <span style={{ color: 'var(--accent)' }}>gbemilesanmi@gmail.com</span>. We will permanently delete your account, annotations, comments, and follow relationships within 30 days.
          </P>
          <P>
            You can delete individual annotations at any time from the extension sidebar or from your profile on the website.
          </P>
        </Section>

        <Section title="Security">
          <P>
            Authentication is handled via secure HTTP-only cookies. Your auth token in the browser extension is stored in Chrome's local storage, isolated to the extension and inaccessible to web pages. All traffic between the extension, the web client, and our API is encrypted over HTTPS.
          </P>
        </Section>

        <Section title="Children">
          <P>
            Scholic is not directed at children under 13. We do not knowingly collect personal data from children. If you believe a child has created an account, contact us and we will delete it.
          </P>
        </Section>

        <Section title="Changes to this policy">
          <P>
            We may update this policy as the product evolves. When we do, we will update the effective date at the top of this page. Continued use of Scholic after a change constitutes acceptance of the updated policy.
          </P>
        </Section>

        <Section title="Contact">
          <P>
            Questions about this policy or your data: <span style={{ color: 'var(--accent)' }}>gbemilesanmi@gmail.com</span>
          </P>
        </Section>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 32, marginTop: 16 }}>
          <span
            onClick={() => navigate('/')}
            style={{ fontSize: 13, color: 'var(--text-faint)', cursor: 'pointer', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-soft)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}
          >
            ← Back to Scholic
          </span>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
