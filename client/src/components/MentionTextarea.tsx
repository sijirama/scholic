import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, KeyboardEvent, TextareaHTMLAttributes } from 'react';
import api from '../lib/api';
import Avatar from './Avatar';
import { useAuth } from '../contexts/AuthContext';

interface MentionUser {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
}

interface MentionTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  wrapperStyle?: CSSProperties;
  textareaStyle?: CSSProperties;
}

const mentionAtCursor = (value: string, cursor: number) => {
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([A-Za-z0-9_]{0,30})$/);
  if (!match) return null;
  return {
    query: match[2] || '',
    start: cursor - (match[2]?.length || 0) - 1,
    end: cursor,
  };
};

function shuffled<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

const MentionTextarea: React.FC<MentionTextareaProps> = ({
  value,
  onChange,
  wrapperStyle,
  textareaStyle,
  onKeyDown,
  onBlur,
  onFocus,
  onScroll,
  ...props
}) => {
  const { user: currentUser } = useAuth();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(null);
  const [query, setQuery] = useState('');
  // Popover anchored to the textarea via fixed coords + portal so an ancestor
  // overflow:hidden (e.g. the framer-motion comment drawer) cannot clip it.
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; width: number; placeAbove: boolean } | null>(null);

  const updateMentionState = (nextValue: string, cursor: number) => {
    const current = mentionAtCursor(nextValue, cursor);
    if (!current) {
      setOpen(false);
      setUsers([]);
      setMentionRange(null);
      setQuery('');
      setLoading(false);
      return;
    }
    setMentionRange({ start: current.start, end: current.end });
    setQuery(current.query);
    setOpen(true);
    setLoading(true);
  };

  useEffect(() => {
    if (!mentionRange) return;
    const controller = new AbortController();
    setLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        let nextUsers: MentionUser[] = [];
        if (query.trim()) {
          const response = await api.get(`/users/search?q=${encodeURIComponent(query)}&limit=6`, {
            signal: controller.signal,
          });
          nextUsers = response.data.users || [];
        } else if (currentUser?.username) {
          const response = await api.get(`/users/${encodeURIComponent(currentUser.username)}/following?limit=24&offset=0`, {
            signal: controller.signal,
          });
          nextUsers = shuffled<MentionUser>(response.data.users || []).slice(0, 6);
        }

        setUsers(nextUsers);
        setActiveIndex(0);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name !== 'CanceledError') {
          setUsers([]);
          setOpen(true);
        }
      } finally {
        setLoading(false);
      }
    }, query.trim() ? 180 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [currentUser?.username, mentionRange, query]);

  const recomputePopoverPos = () => {
    if (!textareaRef.current) return;
    const rect = textareaRef.current.getBoundingClientRect();
    const estimatedHeight = popoverRef.current?.getBoundingClientRect().height ?? 220;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceAbove >= estimatedHeight + 12 || spaceAbove >= spaceBelow;
    setPopoverPos({
      top: placeAbove ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      placeAbove,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    recomputePopoverPos();
    const handler = () => recomputePopoverPos();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open, users.length, loading]);

  const insertUser = (user: MentionUser) => {
    if (!mentionRange) return;
    const next = `${value.slice(0, mentionRange.start)}@${user.username} ${value.slice(mentionRange.end)}`;
    const cursor = mentionRange.start + user.username.length + 2;
    onChange(next);
    setOpen(false);
    setUsers([]);
    setMentionRange(null);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursor, cursor);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && users.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % users.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + users.length) % users.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const user = users[activeIndex];
        if (user) insertUser(user);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
    }
    onKeyDown?.(event);
  };

  const renderHighlightedText = (text: string) => {
    const nodes: React.ReactNode[] = [];
    const mentionRegex = /@[A-Za-z0-9_]{3,30}/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(text.slice(lastIndex, match.index));
      }
      nodes.push(
        <span
          key={`${match[0]}-${match.index}`}
          style={{
            color: 'transparent',
            background: 'rgba(110,183,129,0.13)',
            borderRadius: '4px',
            fontWeight: 'inherit',
          }}
        >
          {match[0]}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      nodes.push(text.slice(lastIndex));
    }
    if (text.endsWith('\n')) {
      nodes.push('\u200b');
    }
    return nodes;
  };

  const syncMirrorScroll = (target: HTMLTextAreaElement) => {
    if (!mirrorRef.current) return;
    mirrorRef.current.scrollTop = target.scrollTop;
    mirrorRef.current.scrollLeft = target.scrollLeft;
  };

  const mirrorStyle: CSSProperties = {
    ...textareaStyle,
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    whiteSpace: 'pre-wrap',
    overflow: 'hidden',
    color: 'transparent',
    background: 'transparent',
    borderColor: 'transparent',
    zIndex: 2,
  };

  return (
    <div style={{ position: 'relative', ...wrapperStyle }}>
      {value && (
        <div ref={mirrorRef} aria-hidden="true" style={mirrorStyle}>
          {renderHighlightedText(value)}
        </div>
      )}
      <textarea
        {...props}
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          updateMentionState(event.target.value, event.target.selectionStart);
        }}
        onClick={(event) => updateMentionState(event.currentTarget.value, event.currentTarget.selectionStart)}
        onFocus={(event) => {
          updateMentionState(event.currentTarget.value, event.currentTarget.selectionStart);
          onFocus?.(event);
        }}
        onKeyUp={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Backspace', 'Delete'].includes(event.key)) {
            updateMentionState(event.currentTarget.value, event.currentTarget.selectionStart);
          }
        }}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          window.setTimeout(() => setOpen(false), 140);
          onBlur?.(event);
        }}
        onScroll={(event) => {
          syncMirrorScroll(event.currentTarget);
          onScroll?.(event);
        }}
        style={{
          ...textareaStyle,
          position: 'relative',
          zIndex: 1,
        }}
      />
      {open && popoverPos && (users.length > 0 || loading || query.length === 0) && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            left: popoverPos.left,
            width: popoverPos.width,
            ...(popoverPos.placeAbove
              ? { bottom: window.innerHeight - popoverPos.top }
              : { top: popoverPos.top }),
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            padding: '6px',
            zIndex: 9999,
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
          }}
        >
          {loading ? (
            <div style={{ padding: '9px 10px', color: '#777', fontSize: '12px' }}>
              Finding people...
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: '9px 10px', color: '#777', fontSize: '12px', lineHeight: 1.4 }}>
              {query.trim() ? 'No matching users' : currentUser ? 'No following yet. Type a name to search.' : 'Type a name to search people.'}
            </div>
          ) : users.map((user, index) => {
            const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ');
            return (
              <button
                key={user.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertUser(user);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 8px',
                  border: 'none',
                  borderRadius: '6px',
                  background: index === activeIndex ? 'rgba(110,183,129,0.12)' : 'transparent',
                  color: '#ddd',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                <Avatar user={user} size={24} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '12px', fontWeight: 700 }}>@{user.username}</span>
                  {displayName && (
                    <span style={{ display: 'block', fontSize: '11px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayName}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};

export default MentionTextarea;
