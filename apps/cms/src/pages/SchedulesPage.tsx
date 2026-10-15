import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { get, post } from '../api/client';
import type { ScheduleDetail, ScheduleSummary } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Form, value } from '../components/Form';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { Card, EmptyState, IconTile, SectionHeading, linkClass } from '../components/ui';
import { useFormErrors } from '../lib/use-form-errors';
import { useOrgRole } from '../lib/use-org-role';

export function SchedulesPage() {
  const { t } = useTranslation();
  const { orgId = '' } = useParams();
  const navigate = useNavigate();
  const canEdit = useOrgRole(orgId).allowed;

  const list = useQuery({
    queryKey: ['schedules', orgId],
    queryFn: () => get<{ schedules: ScheduleSummary[] }>(`/api/v1/orgs/${orgId}/schedules`),
  });
  const create = useMutation({
    mutationFn: (name: string) =>
      post<{ schedule: ScheduleDetail }>(`/api/v1/orgs/${orgId}/schedules`, { name }),
    onSuccess: ({ schedule }) => {
      void navigate(`/orgs/${orgId}/schedules/${schedule.id}`);
    },
  });
  const errors = useFormErrors(create.error);
  const listErrors = useFormErrors(list.error);

  return (
    <>
      <PageHeading title={t('schedules.title')} description={t('schedules.intro')} />
      {listErrors.form && (
        <div className="mb-6">
          <Alert variant="error">{listErrors.form}</Alert>
        </div>
      )}

      {canEdit && (
        <section aria-labelledby="create-schedule-heading" className="mb-10 max-w-xl">
          <SectionHeading id="create-schedule-heading" title={t('schedules.create')} />
          <Card className="p-5">
            <Form
              errors={errors}
              labelledBy="create-schedule-heading"
              onSubmit={(data) => {
                create.mutate(value(data, 'name'));
              }}
            >
              <Field
                label={t('schedules.name')}
                name="name"
                required
                maxLength={200}
                error={errors.fields.name}
              />
              <div>
                <Button type="submit" loading={create.isPending}>
                  {t('schedules.create')}
                </Button>
              </div>
            </Form>
          </Card>
        </section>
      )}

      <section aria-labelledby="schedule-list-heading">
        <SectionHeading id="schedule-list-heading" title={t('schedules.title')} />
        {list.isPending && <Loading />}
        {list.data?.schedules.length === 0 && (
          <EmptyState
            icon={CalendarClock}
            title={t('schedules.empty')}
            text={t('schedules.emptyText')}
          />
        )}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.data?.schedules.map((schedule) => (
            <Card as="li" key={schedule.id} className="flex gap-3 p-4">
              <IconTile icon={CalendarClock} tone="sky" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h3 className="text-lg font-bold" dir="auto">
                  {schedule.name}
                </h3>
                <p className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                  {t('schedules.summary', {
                    entries: schedule.entryCount,
                    screens: schedule.screenCount,
                  })}
                </p>
                <Link to={`/orgs/${orgId}/schedules/${schedule.id}`} className={linkClass}>
                  {t('schedules.open')}
                  <span className="sr-only">{` ${schedule.name}`}</span>
                </Link>
              </div>
            </Card>
          ))}
        </ul>
      </section>
    </>
  );
}
