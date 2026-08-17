export interface YouTubePreview {
  videoId: string;
  thumbnailUrl: string;
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

export function getYouTubePreview(rawUrl: string): YouTubePreview | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) return null;

    const videoId = getYouTubeVideoId(url);
    if (!videoId) return null;

    return {
      videoId,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return null;
  }
}

function getYouTubeVideoId(url: URL): string {
  const host = url.hostname.toLowerCase();

  if (host === 'youtu.be') {
    return cleanVideoId(url.pathname.split('/').filter(Boolean)[0] || '');
  }

  const pathParts = url.pathname.split('/').filter(Boolean);
  if (pathParts[0] === 'watch') {
    return cleanVideoId(url.searchParams.get('v') || '');
  }
  if (['shorts', 'embed', 'live'].includes(pathParts[0])) {
    return cleanVideoId(pathParts[1] || '');
  }

  return '';
}

function cleanVideoId(value: string): string {
  const match = value.match(/^[a-zA-Z0-9_-]{11}/);
  return match?.[0] || '';
}
