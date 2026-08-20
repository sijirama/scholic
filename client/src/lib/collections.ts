import type { Annotation, User } from '../components/AnnotationCard';

export interface BookmarkRecord {
  id: number;
  createdAt: string;
  url: string;
  title: string;
  favicon: string;
  domain: string;
  isPrivate: boolean;
  user?: User;
}

export interface CollectionSummary {
  id: number;
  createdAt: string;
  updatedAt: string;
  ownerId: number;
  owner: User;
  title: string;
  description: string;
  coverImageUrl: string;
  coverPositionY: number;
  isPrivate: boolean;
  entryCount: number;
  hasTarget?: boolean;
  targetEntryId?: number;
}

export interface CollectionEntry {
  id: number;
  createdAt: string;
  targetType: 'annotation' | 'bookmark';
  targetId: number;
  addedBy: User;
  annotation?: Annotation;
  bookmark?: BookmarkRecord;
}

export interface CollectionDetail extends CollectionSummary {
  entries: CollectionEntry[];
  limit?: number;
  offset?: number;
}

export function collectionPrivacyLabel(collection: Pick<CollectionSummary, 'isPrivate'>) {
  return collection.isPrivate ? 'private' : 'public';
}
