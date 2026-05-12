import { useEffect, useState } from 'react';
import api from './api';

export interface UploadedDocSummary {
  id: number;
  title: string;
  authors: string[];
  user: { username: string };
}

// Uploaded PDFs live under the R2 "documents/" key prefix, so their public URL
// always contains "/documents/". Anything else can skip the lookup.
export function looksLikeUploadedDoc(url: string): boolean {
  if (!url) return false;
  return url.includes('/documents/');
}

type CacheEntry =
  | { status: 'pending'; promise: Promise<UploadedDocSummary | null> }
  | { status: 'resolved'; doc: UploadedDocSummary | null };

const cache = new Map<string, CacheEntry>();

export function getCachedUploadedDoc(url: string): UploadedDocSummary | null | undefined {
  const entry = cache.get(url);
  return entry?.status === 'resolved' ? entry.doc : undefined;
}

export function fetchUploadedDoc(url: string): Promise<UploadedDocSummary | null> {
  if (!looksLikeUploadedDoc(url)) return Promise.resolve(null);

  const existing = cache.get(url);
  if (existing) {
    return existing.status === 'resolved' ? Promise.resolve(existing.doc) : existing.promise;
  }

  const promise = api.get(`/documents/by-url?url=${encodeURIComponent(url)}`)
    .then((res) => res.data as UploadedDocSummary)
    .catch(() => null)
    .then((doc) => {
      cache.set(url, { status: 'resolved', doc });
      return doc;
    });
  cache.set(url, { status: 'pending', promise });
  return promise;
}

export function useUploadedDoc(url: string | undefined): UploadedDocSummary | null {
  // Cache is module-level and synchronous, so we read it during render instead
  // of mirroring it into state. A counter is bumped from the async fetch
  // callback to force a re-render once the cache is populated.
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!url || !looksLikeUploadedDoc(url)) return;
    if (getCachedUploadedDoc(url) !== undefined) return;
    let cancelled = false;
    fetchUploadedDoc(url).then(() => {
      if (!cancelled) forceUpdate((v) => v + 1);
    });
    return () => { cancelled = true; };
  }, [url]);

  if (!url) return null;
  const cached = getCachedUploadedDoc(url);
  return cached ?? null;
}
