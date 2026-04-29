import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AtSign, Bell, CheckCheck, MessageCircle, SmilePlus, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import Avatar from './Avatar';

interface NotificationUser {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
}

interface NotificationAnnotation {
  id: number;
  quoteText?: string;
  text?: string;
  linkTitle?: string;
  linkDomain?: string;
}

interface NotificationItem {
  id: number;
  type: 'follow' | 'comment' | 'reaction' | 'mention';
  actor: NotificationUser;
  annotation?: NotificationAnnotation;
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
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;
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
  }
};

const linkFor = (notification: NotificationItem) => {
  if (notification.type === 'follow') return `/u/${notification.actor.username}`;
  if (notification.annotation?.id) return `/annotation/${notification.annotation.id}`;
  return '/notifications';
};

const NotificationsMenu: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await api.get('/notifications/unread-count');
      setUnreadCount(response.data.count || 0);
    } catch {
      setUnreadCount(0);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/notifications?limit=8&offset=0');
      setNotifications(response.data.notifications || []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const timer = window.setInterval(fetchUnreadCount, 60000);
    return () => window.clearInterval(timer);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (!open) return;
    fetchUnreadCount();
    fetchNotifications();
  }, [fetchNotifications, fetchUnreadCount, open]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      fetchUnreadCount();
      if (open) fetchNotifications();
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [fetchNotifications, fetchUnreadCount, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markRead = async (notification: NotificationItem) => {
    if (!notification.readAt) {
      setNotifications((prev) => prev.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
      setUnreadCount((count) => Math.max(0, count - 1));
      api.post(`/notifications/${notification.id}/read`).catch(() => fetchUnreadCount());
    }
    setOpen(false);
    navigate(linkFor(notification));
  };

  const markAllRead = async () => {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((item) => ({ ...item, readAt: item.readAt || now })));
    setUnreadCount(0);
    try {
      await api.post('/notifications/read-all');
    } catch {
      fetchUnreadCount();
      fetchNotifications();
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        title="Notifications"
        style={{
          position: 'relative',
          width: 30,
          height: 30,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.07)',
          background: open ? 'rgba(110,183,129,0.12)' : 'rgba(255,255,255,0.03)',
          color: open ? '#6EB781' : '#888',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <Bell style={{ width: 15, height: 15 }} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -3,
              right: -4,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 999,
              background: '#6EB781',
              color: '#061008',
              fontSize: 10,
              lineHeight: '16px',
              fontWeight: 800,
              border: '2px solid #121212',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 38,
            width: 360,
            maxWidth: 'calc(100vw - 32px)',
            background: '#171717',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
            overflow: 'hidden',
            zIndex: 100,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Notifications</span>
            <button
              onClick={markAllRead}
              title="Mark all read"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#6EB781', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <CheckCheck style={{ width: 13, height: 13 }} />
              Mark all
            </button>
          </div>

          <div style={{ maxHeight: 390, overflow: 'auto' }}>
            {loading ? (
              <div style={{ padding: 22, color: '#555', fontSize: 12, textAlign: 'center' }}>Loading...</div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '34px 20px', color: '#555', fontSize: 13, textAlign: 'center' }}>No notifications yet</div>
            ) : notifications.map((notification) => {
              const Icon = iconFor(notification.type);
              const unread = !notification.readAt;
              const preview = notification.comment?.text || notification.annotation?.text || notification.annotation?.quoteText || notification.annotation?.linkTitle || notification.annotation?.linkDomain;
              return (
                <button
                  key={notification.id}
                  onClick={() => markRead(notification)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    gap: 10,
                    padding: '12px 14px',
                    background: unread ? 'rgba(110,183,129,0.055)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                  className="hover:bg-white/5"
                >
                  <Avatar user={notification.actor} size={32} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                      <Icon style={{ width: 13, height: 13, color: '#6EB781', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#ddd', fontWeight: unread ? 700 : 500 }}>{textFor(notification)}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: '#555', flexShrink: 0 }}>{timeAgo(notification.createdAt)}</span>
                    </div>
                    {preview && (
                      <div style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {preview}
                      </div>
                    )}
                  </div>
                  {unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#6EB781', marginTop: 6, flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
            style={{ width: '100%', padding: 11, background: 'rgba(255,255,255,0.03)', border: 'none', color: '#6EB781', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationsMenu;
