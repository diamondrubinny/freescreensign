import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { get } from '../api/client';
import type { AuditEvent } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { formatDateTime } from '../lib/format';
import { useFormErrors } from '../lib/use-form-errors';

interface Page {
  events: AuditEvent[];
  nextCursor: string | null;
}

export function AuditPage() {
  const { t, i18n } = useTranslation();
  const { orgId = '' } = useParams();
  const audit = useInfiniteQuery({
    queryKey: ['audit', orgId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      get<Page>(`/api/v1/orgs/${orgId}/audit?limit=50${pageParam ? `&before=${pageParam}` : ''}`),
    getNextPageParam: (last) => last.nextCursor,
  });
  const errors = useFormErrors(audit.error);
  const events = audit.data?.pages.flatMap((page) => page.events) ?? [];

  return (
    <>
      <PageHeading title={t('audit.title')} />
      {errors.form && <Alert variant="error">{errors.form}</Alert>}
      {audit.isPending && <Loading />}
      {audit.isSuccess && events.length === 0 && <p>{t('audit.empty')}</p>}
      {events.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">{t('audit.title')}</caption>
            <thead>
              <tr className="border-b border-gray-400">
                <th scope="col" className="p-2 text-start">
                  {t('audit.when')}
                </th>
                <th scope="col" className="p-2 text-start">
                  {t('audit.who')}
                </th>
                <th scope="col" className="p-2 text-start">
                  {t('audit.what')}
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-gray-200 dark:border-gray-700">
                  <td className="p-2 whitespace-nowrap">
                    {formatDateTime(event.createdAt, i18n.language)}
                  </td>
                  <td className="p-2">{event.actorName ?? t('audit.system')}</td>
                  <td className="p-2">
                    <code dir="ltr">{event.action}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {audit.hasNextPage && (
        <Button
          variant="secondary"
          className="mt-4"
          loading={audit.isFetchingNextPage}
          onClick={() => {
            void audit.fetchNextPage();
          }}
        >
          {t('common.loadMore')}
        </Button>
      )}
    </>
  );
}
