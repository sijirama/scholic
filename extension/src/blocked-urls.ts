/**
 * blocked-urls.ts — URL patterns where Scholic should be fully invisible.
 *
 * These are high-churn feed / infinite-scroll pages where DOM mutations are
 * so frequent that highlights would be destroyed and re-anchoring would
 * thrash the page. Scholic is fully disabled here — no peek tab, no badge.
 *
 * Rule structure:
 *   hostname  — exact string or regex matching window.location.hostname
 *   blockPath — if set, only block when pathname matches this regex
 *   allowPath — if set, ALWAYS allow (override blockPath) when pathname matches
 *   reason    — human-readable note for why this site/page is blocked
 *
 * A URL is blocked when:
 *   1. hostname matches, AND
 *   2. blockPath is absent OR pathname matches blockPath, AND
 *   3. allowPath is absent OR pathname does NOT match allowPath
 */

export interface BlockedPattern {
  hostname: string | RegExp;
  blockPath?: RegExp;
  allowPath?: RegExp;
  reason: string;
}

export const BLOCKED_PATTERNS: BlockedPattern[] = [

  // ── X / Twitter ───────────────────────────────────────────────────────────
  // Allow tweet permalink pages (/status/) and user profiles (/:user/status/).
  // Block everything else: home feed, explore, notifications, messages, etc.
  {
    hostname: 'x.com',
    blockPath: /^\/(home|explore|notifications?|messages?|i\/|bookmarks|communities|premium|search|compose|settings|connect_people|following_suggestions|who_to_follow)(\/|$)/,
    reason: 'X.com dynamic feed / system pages',
  },
  {
    hostname: 'twitter.com',
    blockPath: /^\/(home|explore|notifications?|messages?|i\/|bookmarks|communities|premium|search|compose|settings|connect_people|following_suggestions|who_to_follow)(\/|$)/,
    reason: 'Twitter.com dynamic feed / system pages',
  },

  // ── Pinterest ──────────────────────────────────────────────────────────────
  // Allow specific pin pages and board pages. Block everything else (home feed,
  // today, search, explore).
  {
    hostname: 'pinterest.com',
    allowPath: /^\/(pin\/|[^/]+\/[^/]+\/|[^/]+\/boards\/)/,
    reason: 'Pinterest — home feed and explore are too dynamic',
  },
  {
    hostname: /^[a-z]{2}\.pinterest\.com$/,
    allowPath: /^\/(pin\/|[^/]+\/[^/]+\/|[^/]+\/boards\/)/,
    reason: 'Pinterest regional domains (e.g. uk.pinterest.com)',
  },

  // ── Facebook ──────────────────────────────────────────────────────────────
  // Block primary feed surfaces. Allow specific posts, groups posts, events.
  {
    hostname: 'facebook.com',
    blockPath: /^\/(|watch\/?|gaming\/?|marketplace\/?|groups\/?$|reels\/?|memories\/?|friends\/?|notifications\/?|videos\/?$|stories\/?)(\/|$)?$/,
    reason: 'Facebook dynamic feed pages',
  },
  {
    hostname: 'www.facebook.com',
    blockPath: /^\/(|watch\/?|gaming\/?|marketplace\/?|groups\/?$|reels\/?|memories\/?|friends\/?|notifications\/?|videos\/?$|stories\/?)(\/|$)?$/,
    reason: 'Facebook dynamic feed pages',
  },

  // ── Instagram ─────────────────────────────────────────────────────────────
  // Allow specific posts (/p/), reels (/reel/), stories, and user profiles.
  // Block home feed, explore, and reels index.
  {
    hostname: 'instagram.com',
    blockPath: /^\/(|explore\/?|reels\/?$|direct\/|accounts\/)(\/|$)?$/,
    reason: 'Instagram dynamic feed and explore',
  },
  {
    hostname: 'www.instagram.com',
    blockPath: /^\/(|explore\/?|reels\/?$|direct\/|accounts\/)(\/|$)?$/,
    reason: 'Instagram dynamic feed and explore',
  },

  // ── TikTok ────────────────────────────────────────────────────────────────
  // Allow specific video pages (/@user/video/id). Block everything else.
  {
    hostname: 'tiktok.com',
    allowPath: /^\/@[^/]+\/video\//,
    reason: 'TikTok — only specific video pages are stable enough',
  },
  {
    hostname: 'www.tiktok.com',
    allowPath: /^\/@[^/]+\/video\//,
    reason: 'TikTok — only specific video pages are stable enough',
  },

  // ── LinkedIn ──────────────────────────────────────────────────────────────
  // Block feed, notifications, messaging, jobs, events list.
  // Allow profiles (/in/), posts (/posts/), pulse articles.
  {
    hostname: 'linkedin.com',
    blockPath: /^\/(feed\/?|notifications\/?|messaging\/?|jobs\/?$|events\/?$|mynetwork\/?|learning\/?)(\/|$)?$/,
    reason: 'LinkedIn dynamic feed pages',
  },
  {
    hostname: 'www.linkedin.com',
    blockPath: /^\/(feed\/?|notifications\/?|messaging\/?|jobs\/?$|events\/?$|mynetwork\/?|learning\/?)(\/|$)?$/,
    reason: 'LinkedIn dynamic feed pages',
  },

  // ── Reddit ────────────────────────────────────────────────────────────────
  // Block home feed, popular, all. Allow subreddit comment pages and user pages.
  {
    hostname: 'reddit.com',
    blockPath: /^\/(|r\/popular\/?|r\/all\/?|r\/home\/?)(\/|$)?$/,
    reason: 'Reddit home/popular/all feeds',
  },
  {
    hostname: 'www.reddit.com',
    blockPath: /^\/(|r\/popular\/?|r\/all\/?|r\/home\/?)(\/|$)?$/,
    reason: 'Reddit home/popular/all feeds',
  },
  {
    hostname: 'old.reddit.com',
    blockPath: /^\/(|r\/popular\/?|r\/all\/?|r\/home\/?)(\/|$)?$/,
    reason: 'Old Reddit home/popular/all feeds',
  },

  // ── YouTube ───────────────────────────────────────────────────────────────
  // Block home feed and shorts index. Allow watch pages, channel pages, playlists.
  {
    hostname: 'youtube.com',
    blockPath: /^\/(|shorts\/?$|gaming\/?|explore\/?|trending\/?)(\/|$)?$/,
    reason: 'YouTube home feed and shorts index',
  },
  {
    hostname: 'www.youtube.com',
    blockPath: /^\/(|shorts\/?$|gaming\/?|explore\/?|trending\/?)(\/|$)?$/,
    reason: 'YouTube home feed and shorts index',
  },

  // ── Twitch ────────────────────────────────────────────────────────────────
  // Block directory (browse) pages. Allow individual streamer pages.
  {
    hostname: 'twitch.tv',
    blockPath: /^\/(directory|p\/|subscriptions|drops|friends|messages)(\/|$)/,
    reason: 'Twitch dynamic directory and browse pages',
  },
  {
    hostname: 'www.twitch.tv',
    blockPath: /^\/(directory|p\/|subscriptions|drops|friends|messages)(\/|$)/,
    reason: 'Twitch dynamic directory and browse pages',
  },

  // ── Snapchat ──────────────────────────────────────────────────────────────
  {
    hostname: 'web.snapchat.com',
    reason: 'Snapchat web — entirely dynamic messaging/stories UI',
  },

  // ── WhatsApp Web ──────────────────────────────────────────────────────────
  {
    hostname: 'web.whatsapp.com',
    reason: 'WhatsApp Web — real-time messaging, DOM thrash',
  },

  // ── Discord ───────────────────────────────────────────────────────────────
  {
    hostname: 'discord.com',
    blockPath: /^\/(channels|activity|store|guild-discovery)(\/|$)/,
    reason: 'Discord — highly dynamic chat and activity feeds',
  },

  // ── Slack ─────────────────────────────────────────────────────────────────
  {
    hostname: 'app.slack.com',
    reason: 'Slack — real-time messaging, DOM thrash',
  },

  // ── Google products ───────────────────────────────────────────────────────
  {
    hostname: 'mail.google.com',
    reason: 'Gmail — highly dynamic email client',
  },
  {
    hostname: 'calendar.google.com',
    reason: 'Google Calendar — dynamic calendar interface',
  },
  {
    hostname: 'docs.google.com',
    blockPath: /^\/(spreadsheets|presentation)(\/|$)/,
    reason: 'Google Sheets and Slides — dynamic canvas rendering',
  },

  // ── Notion ────────────────────────────────────────────────────────────────
  {
    hostname: 'notion.so',
    reason: 'Notion — block-based editor with heavy DOM mutation',
  },
  {
    hostname: 'www.notion.so',
    reason: 'Notion — block-based editor with heavy DOM mutation',
  },

  // ── Figma ─────────────────────────────────────────────────────────────────
  {
    hostname: 'figma.com',
    blockPath: /^\/(file|proto|design|board)(\/|$)/,
    reason: 'Figma canvas — WebGL / canvas rendering, no DOM text',
  },
  {
    hostname: 'www.figma.com',
    blockPath: /^\/(file|proto|design|board)(\/|$)/,
    reason: 'Figma canvas — WebGL / canvas rendering, no DOM text',
  },

  // ── Google Maps ───────────────────────────────────────────────────────────
  {
    hostname: 'google.com',
    blockPath: /^\/maps(\/|$)/,
    reason: 'Google Maps — canvas-based, no stable DOM text',
  },
  {
    hostname: 'maps.google.com',
    reason: 'Google Maps — canvas-based, no stable DOM text',
  },

  // ── Scholic ───────────────────────────────────────────────────────────────
  // Disable extension on the Scholic web app itself to avoid self-annotation
  // loops and UI conflicts with the native annotation views.
  {
    hostname: 'scholic.com',
    reason: 'Scholic web app — native annotation views, no extension needed',
  },
  {
    hostname: 'www.scholic.com',
    reason: 'Scholic web app — native annotation views, no extension needed',
  },
];

/**
 * Returns true if Scholic should be fully disabled for the given URL.
 */
export function isBlockedUrl(href: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return false;
  }

  const hostname = parsed.hostname;
  const pathname = parsed.pathname;

  for (const pattern of BLOCKED_PATTERNS) {
    // 1. Hostname check
    const hostnameMatches =
      typeof pattern.hostname === 'string'
        ? hostname === pattern.hostname
        : pattern.hostname.test(hostname);

    if (!hostnameMatches) continue;

    // 2. allowPath check — if path is explicitly allowed, skip this pattern
    if (pattern.allowPath && pattern.allowPath.test(pathname)) continue;

    // 3. blockPath check — if no blockPath, entire hostname is blocked;
    //    otherwise only block when path matches
    if (!pattern.blockPath || pattern.blockPath.test(pathname)) {
      return true;
    }
  }

  return false;
}
