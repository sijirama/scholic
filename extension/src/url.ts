export function canonicalAnnotationUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if (isYouTubeWatchUrl(url)) {
      const videoId = url.searchParams.get('v');
      url.search = videoId ? `?v=${encodeURIComponent(videoId)}` : '';
    } else {
      url.search = '';
    }
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }
    return url.toString();
  } catch {
    return rawUrl.split('#', 1)[0].split('?', 1)[0];
  }
}

function isYouTubeWatchUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (host === 'youtube.com' || host.endsWith('.youtube.com')) && url.pathname === '/watch';
}
