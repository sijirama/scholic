import React, { useCallback, useEffect, useState } from 'react';
import { AtSign, Bell, BookOpen, CheckCheck, MessageCircle, Reply, SmilePlus, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar';
import api from '../lib/api';

interface NotificationUser {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
}

interface NotificationItem {
  id: number;
  type: 'follow' | 'comment' | 'reaction' | 'mention' | 'reply' | 'shared_doc';
  actor: NotificationUser;
  annotation?: {
    id: number;
    quoteText?: string;
    text?: string;
    linkTitle?: string;
    linkDomain?: string;
  };
  comment?: { text?: string };
  createdAt: string;
  readAt?: string | null;
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const iconFor = (type: NotificationItem['type']) => {
  switch (type) {
    case 'follow':
      return UserPlus;
    case 'comment':
      return MessageCircle;
    case 'reaction':
      return SmilePlus;
    case 'mention':
      return AtSign;
    case 'reply':
      return Reply;
    case 'shared_doc':
      return BookOpen;
  }
};

const textFor = (notification: NotificationItem) => {
  const actor = `@${notification.actor?.username || 'someone'}`;
  switch (notification.type) {
    case 'follow':
      return `${actor} followed you`;
    case 'comment':
      return `${actor} commented on your annotation`;
    case 'reaction':
      return `${actor} reacted to your annotation`;
    case 'mention':
      return `${actor} mentioned you`;
    case 'reply':
      return `${actor} replied in a thread you're in`;
    case 'shared_doc':
      return `${actor} annotated a page you've annotated`;
  }
};

const linkFor = (notification: NotificationItem) => {
  if (notification.type === 'follow') return `/u/${notification.actor.username}`;
  if (notification.annotation?.id) return `/annotation/${notification.annotation.id}`;
  return '/notifications';
};

const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 25;

  const fetchNotifications = useCallback(async (nextOffset = 0, append = false) => {
    if (append) {
      setFetchingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const response = await api.get(`/notifications?limit=${limit}&offset=${nextOffset}`);
      const items: NotificationItem[] = response.data.notifications || [];
      setNotifications((prev) => append ? [...prev, ...items] : items);
      setTotal(response.data.total || 0);
      setOffset(nextOffset + items.length);
    } catch {
      if (!append) {
        setNotifications([]);
        setTotal(0);
        setOffset(0);
      }
    } finally {
      setLoading(false);
      setFetchingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications(0, false);
  }, [fetchNotifications]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications(0, false);
      }
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [fetchNotifications]);

  const markReadAndOpen = async (notification: NotificationItem) => {
    if (!notification.readAt) {
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((item) => item.id === notification.id ? { ...item, readAt: now } : item));
      api.post(`/notifications/${notification.id}/read`).catch(() => undefined);
    }
    navigate(linkFor(notification));
  };

  const markAllRead = async () => {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((item) => ({ ...item, readAt: item.readAt || now })));
    await api.post('/notifications/read-all').catch(() => undefined);
  };

  return (
    <div className="theme-page" style={{ fontFamily: '"Inter", sans-serif' }}>
      <Navbar />
      <main style={{ maxWidth: 700, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Notifications</h1>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>Mentions, replies, reactions, and new followers.</p>
          </div>
          <button
            onClick={markAllRead}
            className="theme-pill"
            style={{ display: 'flex', alignItems: 'center', gap: 7, borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <CheckCheck style={{ width: 14, height: 14 }} />
            Mark all read
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '56px 0', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div style={{ padding: '64px 20px', textAlign: 'center', color: 'var(--text-dim)' }}>
            <Bell style={{ width: 34, height: 34, margin: '0 auto 14px', opacity: 0.35 }} />
            <div style={{ fontSize: 14, color: 'var(--text-soft)', marginBottom: 4 }}>No notifications yet</div>
            <div style={{ fontSize: 12 }}>When people mention, follow, reply, or react, it will show here.</div>
          </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {notifications.map((notification) => {
              const Icon = iconFor(notification.type);
              const unread = !notification.readAt;
              const preview = notification.comment?.text || notification.annotation?.text || notification.annotation?.quoteText || notification.annotation?.linkTitle || notification.annotation?.linkDomain;
              return (
                <button
                  key={notification.id}
                  onClick={() => markReadAndOpen(notification)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                    padding: '16px 0',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <Avatar user={notification.actor} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <Icon style={{ width: 15, height: 15, color: 'var(--accent)' }} />
                      <span style={{ color: unread ? 'var(--text)' : 'var(--text-muted)', fontSize: 14, fontWeight: unread ? 700 : 500 }}>{textFor(notification)}</span>
                      <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 'auto' }}>{timeAgo(notification.createdAt)}</span>
                    </div>
                    {preview && (
                      <p style={{ color: 'var(--text-soft)', fontSize: 13, lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {preview}
                      </p>
                    )}
                  </div>
                  {unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', marginTop: 7, flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        )}

        {notifications.length < total && (
          <button
            onClick={() => fetchNotifications(offset, true)}
            disabled={fetchingMore}
            className="theme-button-secondary"
            style={{ marginTop: 20, width: '100%', padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: fetchingMore ? 'default' : 'pointer', fontFamily: 'inherit', opacity: fetchingMore ? 0.6 : 1 }}
          >
            {fetchingMore ? 'Loading...' : 'Load more'}
          </button>
        )}
      </main>
    </div>
  );
};

export default Notifications;
