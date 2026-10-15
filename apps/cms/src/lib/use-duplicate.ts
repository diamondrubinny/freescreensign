import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { post } from '../api/client';

type Kind = 'playlists' | 'layouts' | 'widgets';
const RESULT_KEY = { playlists: 'playlist', layouts: 'layout', widgets: 'widget' } as const;

/** Duplicates a playlist, layout or widget and opens the copy. */
export function useDuplicate(orgId: string, kind: Kind, id: string) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      post<Record<string, { id: string }>>(`/api/v1/orgs/${orgId}/${kind}/${id}/duplicate`, {
        name: t('layouts.copyName', { name }).slice(0, 200),
      }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: [kind, orgId] });
      const copy = data[RESULT_KEY[kind]];
      if (copy) void navigate(`/orgs/${orgId}/${kind}/${copy.id}`);
    },
  });
}
