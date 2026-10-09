// apps/web/src/lib/collections.ts
import type { CollectionDetail, CollectionSummary } from '@superlibrary/contract';
import { change, type Ask } from './item';
import { loadJson } from './library';

type Api = (path: string, init?: RequestInit) => Promise<Response>;

export const listCollections = (api: Api) => loadJson<{ collections: CollectionSummary[] }>(api, '/api/v1/collections');
export const getCollection = (api: Api, id: string) => loadJson<CollectionDetail>(api, `/api/v1/collections/${id}`);
export const createCollection = (api: Api, name: string, description: string) => loadJson<CollectionSummary>(api, '/api/v1/collections', { name, description });
export const updateCollection = (api: Api, id: string, patch: { name?: string; description?: string }) => change(api, `/api/v1/collections/${id}`, 'PATCH', patch);
export const deleteCollection = (api: Api, id: string) => change(api, `/api/v1/collections/${id}`, 'DELETE');
export const addToCollection = (api: Api, id: string, itemId: string) => change(api, `/api/v1/collections/${id}/items`, 'POST', { itemId });
export const removeFromCollection = (api: Api, id: string, itemId: string) => change(api, `/api/v1/collections/${id}/items/${itemId}`, 'DELETE');

export const askDeleteCollection = (name: string): Ask => ({
  title: `Delete the collection “${name}”?`,
  message: 'The collection goes; its items stay in the library. An artifact kept only by this collection is deleted after 30 days.',
  action: 'Delete collection',
});
