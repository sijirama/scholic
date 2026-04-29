import React from 'react';
import { Plus } from 'lucide-react';
import api from '../lib/api';
import { REACTION_EMOJIS } from '../lib/reactions';

interface ReactionStripProps {
  annotationId: number | string;
  reactionCounts?: Record<string, number>;
  myReaction?: string;
  /** When falsy, the +button + click-to-react are gated off — chips read-only. */
  canReact: boolean;
  /** Optional: parent wants to know when state changes (e.g. to refresh siblings). */
  onChange?: (counts: Record<string, number>, mine: string) => void;
}

const ReactionStrip: React.FC<ReactionStripProps> = ({
  annotationId,
  reactionCounts: propCounts,
  myReaction: propMine,
  canReact,
  onChange,
}) => {
  // Local state so optimistic updates land instantly. useEffect re-syncs from
  // props so a parent refetch overrides stale local state.
  const [reactionCounts, setReactionCounts] = React.useState<Record<string, number>>(propCounts || {});
  const [myReaction, setMyReaction] = React.useState<string>(propMine || '');
  const [pickerOpen, setPickerOpen] = React.useState(false);

  React.useEffect(() => {
    setReactionCounts(propCounts || {});
    setMyReaction(propMine || '');
  }, [annotationId, propCounts, propMine]);

  const handleReact = async (emoji: string) => {
    if (!canReact) return;
    const prevCounts = reactionCounts;
    const prevMine = myReaction;

    // Optimistic state computation
    const next = { ...prevCounts };
    if (prevMine && prevMine !== emoji) {
      next[prevMine] = Math.max(0, (next[prevMine] || 1) - 1);
      if (next[prevMine] === 0) delete next[prevMine];
    }
    if (prevMine === emoji) {
      next[emoji] = Math.max(0, (next[emoji] || 1) - 1);
      if (next[emoji] === 0) delete next[emoji];
      setMyReaction('');
    } else {
      next[emoji] = (next[emoji] || 0) + 1;
      setMyReaction(emoji);
    }
    setReactionCounts(next);
    setPickerOpen(false);

    try {
      const res = await api.post(`/annotations/${annotationId}/reactions`, { emoji });
      const serverCounts = res.data.counts || {};
      const serverMine = res.data.mine || '';
      setReactionCounts(serverCounts);
      setMyReaction(serverMine);
      onChange?.(serverCounts, serverMine);
    } catch {
      setReactionCounts(prevCounts);
      setMyReaction(prevMine);
    }
  };

  // Visible chips: any emoji with a count plus the user's active reaction.
  // Sorted by curated order so the strip is visually stable across renders.
  const visibleEmojis = React.useMemo(() => {
    const set = new Set<string>(Object.keys(reactionCounts));
    if (myReaction) set.add(myReaction);
    return REACTION_EMOJIS.filter(e => set.has(e));
  }, [reactionCounts, myReaction]);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', position: 'relative' }}>
      {visibleEmojis.map(emoji => {
        const count = reactionCounts[emoji] || 0;
        const active = myReaction === emoji;
        return (
          <button
            key={emoji}
            onClick={() => handleReact(emoji)}
            disabled={!canReact}
            title={active ? 'Click to remove your reaction' : 'React'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 7px',
              fontSize: '12px',
              background: active ? 'rgba(110,183,129,0.16)' : 'rgba(255,255,255,0.04)',
              border: active ? '1px solid rgba(110,183,129,0.35)' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: '6px',
              color: '#ccc',
              cursor: canReact ? 'pointer' : 'default',
              fontFamily: 'inherit',
              transition: 'background 0.15s, border-color 0.15s',
              lineHeight: 1,
            }}
          >
            <span>{emoji}</span>
            {count > 0 && <span style={{ fontSize: '11px', color: active ? '#6EB781' : '#888', fontWeight: 600 }}>{count}</span>}
          </button>
        );
      })}
      {canReact && (
        <button
          onClick={() => setPickerOpen(o => !o)}
          title="Add a reaction"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            padding: '0',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '6px',
            color: '#888',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Plus style={{ width: 12, height: 12 }} />
        </button>
      )}
      {pickerOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            right: 0,
            display: 'flex',
            gap: '2px',
            padding: '6px 8px',
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 10,
          }}
          onMouseLeave={() => setPickerOpen(false)}
        >
          {REACTION_EMOJIS.map(emoji => (
            <button
              key={emoji}
              onClick={() => handleReact(emoji)}
              style={{
                fontSize: '18px',
                background: myReaction === emoji ? 'rgba(110,183,129,0.16)' : 'none',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 6px',
                cursor: 'pointer',
                transition: 'background 0.1s',
                lineHeight: 1,
              }}
              onMouseEnter={(e) => { if (myReaction !== emoji) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={(e) => { if (myReaction !== emoji) e.currentTarget.style.background = 'none'; }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReactionStrip;
