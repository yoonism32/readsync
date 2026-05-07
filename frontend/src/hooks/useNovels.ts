import useSWR from 'swr';
import { swrFetcher, novels as novelsApi } from '../api/client.js';
import type { Novel, NovelStatus } from '../types/index.js';

interface NovelsResponse { novels: Novel[] }

export function useNovels(params?: { status?: string; search?: string }) {
  const key = params?.status || params?.search
    ? `/novels?${new URLSearchParams(params as Record<string, string>).toString()}`
    : '/novels';

  const { data, error, isLoading, mutate } = useSWR<NovelsResponse>(
    key,
    swrFetcher,
    { revalidateOnFocus: false }
  );

  return {
    novels: data?.novels ?? [],
    isLoading,
    error: error as Error | undefined,
    mutate,
  };
}

export function useNovelActions(mutate: () => void) {
  async function setStatus(novelId: string, status: NovelStatus) {
    await novelsApi.setStatus(novelId, status);
    mutate();
  }

  async function toggleFavorite(novelId: string, current: boolean) {
    await novelsApi.setFavorite(novelId, !current);
    mutate();
  }

  async function remove(novelId: string) {
    await novelsApi.delete(novelId);
    mutate();
  }

  return { setStatus, toggleFavorite, remove };
}
