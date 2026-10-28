// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, DoorOpen } from 'lucide-react';
import { useId, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { del, get, patch, post, put } from '../api/client';
import type { RoomBookingItem, RoomItem } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { Loading } from '../components/Loading';
import { PageHeading } from '../components/PageHeading';
import { Card, EmptyState, SectionHeading, StatusPill, inputClass } from '../components/ui';
import { useFormErrors } from '../lib/use-form-errors';
import { useOrgRole } from '../lib/use-org-role';

const DAY_MS = 24 * 60 * 60 * 1000;
/** The day board's time line (widened to fit bookings outside it). */
const BOARD_FROM = 7;
const BOARD_TO = 21;

const pad = (n: number) => String(n).padStart(2, '0');
/** "YYYY-MM-DD" of a local date (for <input type="date">). */
const dateKey = (d: Date) =>
  `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** "HH:MM" of a local time (for <input type="time">). */
const timeKey = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** Local midnight of a "YYYY-MM-DD" day. */
const startOfDay = (key: string) => new Date(`${key}T00:00`);
/** A local date and time as an instant (the browser's time zone). */
const localInstant = (day: string, time: string) => new Date(`${day}T${time}`);

interface BookingDraft {
  id: string | null;
  roomId: string;
  day: string;
  from: string;
  to: string;
  title: string;
}

interface RoomDraft {
  id: string | null;
  name: string;
  location: string;
  capacity: string;
  showTitles: boolean;
}

/** The next half hour from now, for a new booking. */
function nextSlot(day: string): { from: string; to: string } {
  const now = new Date();
  if (day !== dateKey(now)) return { from: '09:00', to: '10:00' };
  const start = new Date(Math.ceil(now.getTime() / (30 * 60_000)) * 30 * 60_000);
  const end = new Date(start.getTime() + 60 * 60_000);
  return {
    from: timeKey(start),
    to: end.getDate() === start.getDate() ? timeKey(end) : '23:59',
  };
}

export function RoomsPage() {
  const { t, i18n } = useTranslation();
  const { orgId = '' } = useParams();
  const isAdmin = useOrgRole(orgId, 'ADMIN').allowed;
  const queryClient = useQueryClient();
  const [day, setDay] = useState(() => dateKey(new Date()));
  const [onlyMine, setOnlyMine] = useState(false);
  const [booking, setBooking] = useState<BookingDraft | null>(null);
  const [cancelling, setCancelling] = useState<RoomBookingItem | null>(null);
  const [room, setRoom] = useState<RoomDraft | null>(null);
  const [deleting, setDeleting] = useState<RoomItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const locale = i18n.language === 'he' ? 'he-IL' : 'en-GB';
  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const dayLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(startOfDay(day));

  const rooms = useQuery({
    queryKey: ['rooms', orgId],
    queryFn: () => get<{ rooms: RoomItem[]; pinSet: boolean }>(`/api/v1/orgs/${orgId}/rooms`),
  });
  const from = startOfDay(day);
  const to = new Date(from.getTime() + DAY_MS);
  const bookings = useQuery({
    queryKey: ['room-bookings', orgId, day, onlyMine],
    queryFn: () =>
      get<{ bookings: RoomBookingItem[] }>(
        `/api/v1/orgs/${orgId}/room-bookings?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}${onlyMine ? '&mine=true' : ''}`,
      ),
    // Bookings at room screens appear without a reload.
    refetchInterval: 30_000,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['room-bookings', orgId] });
    void queryClient.invalidateQueries({ queryKey: ['rooms', orgId] });
  };

  const saveBooking = useMutation({
    mutationFn: (draft: BookingDraft) => {
      const body = {
        roomId: draft.roomId,
        startsAt: localInstant(draft.day, draft.from).toISOString(),
        endsAt: localInstant(draft.day, draft.to).toISOString(),
        title: draft.title.trim() || null,
      };
      return draft.id
        ? patch(`/api/v1/orgs/${orgId}/room-bookings/${draft.id}`, body)
        : post(`/api/v1/orgs/${orgId}/room-bookings`, body);
    },
    onSuccess: (_data, draft) => {
      setBooking(null);
      setNotice(draft.id ? t('rooms.updated') : t('rooms.booked'));
      refresh();
    },
  });
  const cancelBooking = useMutation({
    mutationFn: (item: RoomBookingItem) => del(`/api/v1/orgs/${orgId}/room-bookings/${item.id}`),
    onSuccess: () => {
      setCancelling(null);
      setNotice(t('rooms.cancelled'));
      refresh();
    },
    onError: () => {
      setCancelling(null);
    },
  });
  const saveRoom = useMutation({
    mutationFn: (draft: RoomDraft) => {
      const body = {
        name: draft.name.trim(),
        location: draft.location.trim() || null,
        capacity: draft.capacity.trim() === '' ? null : Number(draft.capacity),
        showTitles: draft.showTitles,
      };
      return draft.id
        ? patch(`/api/v1/orgs/${orgId}/rooms/${draft.id}`, body)
        : post(`/api/v1/orgs/${orgId}/rooms`, body);
    },
    onSuccess: () => {
      setRoom(null);
      setNotice(t('rooms.roomSaved'));
      refresh();
    },
  });
  const deleteRoom = useMutation({
    mutationFn: (item: RoomItem) => del(`/api/v1/orgs/${orgId}/rooms/${item.id}`),
    onSuccess: () => {
      setDeleting(null);
      setNotice(t('rooms.roomDeleted'));
      refresh();
    },
    onError: () => {
      setDeleting(null);
    },
  });

  const listErrors = useFormErrors(rooms.error ?? bookings.error ?? cancelBooking.error);
  const deleteErrors = useFormErrors(deleteRoom.error);
  const roomList = rooms.data?.rooms ?? [];
  const roomName = (id: string) => roomList.find((r) => r.id === id)?.name ?? '';

  const openBooking = (roomId: string) => {
    saveBooking.reset();
    setBooking({ id: null, roomId, day, title: '', ...nextSlot(day) });
  };
  const editBooking = (item: RoomBookingItem) => {
    saveBooking.reset();
    const start = new Date(item.startsAt);
    setBooking({
      id: item.id,
      roomId: item.roomId,
      day: dateKey(start),
      from: timeKey(start),
      to: timeKey(new Date(item.endsAt)),
      title: item.title ?? '',
    });
  };
  const shiftDay = (days: number) => {
    setDay(dateKey(new Date(startOfDay(day).getTime() + days * DAY_MS + 12 * 3_600_000)));
  };

  return (
    <>
      <PageHeading title={t('rooms.title')} description={t('rooms.intro')}>
        {roomList.length > 0 && (
          <Button
            onClick={() => {
              openBooking(roomList[0]?.id ?? '');
            }}
          >
            {t('rooms.book')}
          </Button>
        )}
      </PageHeading>
      <div aria-live="polite" className="mb-4 empty:hidden">
        {notice && <Alert variant="success">{notice}</Alert>}
      </div>
      {(listErrors.form ?? deleteErrors.form) && (
        <div className="mb-6">
          <Alert variant="error">{listErrors.form ?? deleteErrors.form}</Alert>
        </div>
      )}

      <section aria-labelledby="rooms-day-heading" className="mb-10">
        <SectionHeading id="rooms-day-heading" title={`${t('rooms.day')}: ${dayLabel}`} />
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Button
            variant="secondary"
            size="sm"
            aria-label={t('rooms.prevDay')}
            onClick={() => {
              shiftDay(-1);
            }}
          >
            <ChevronRight aria-hidden="true" className="ltr:rotate-180" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDay(dateKey(new Date()));
            }}
          >
            {t('rooms.today')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-label={t('rooms.nextDay')}
            onClick={() => {
              shiftDay(1);
            }}
          >
            <ChevronLeft aria-hidden="true" className="ltr:rotate-180" />
          </Button>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('rooms.date')}</span>
            <input
              type="date"
              value={day}
              onChange={(event) => {
                if (event.target.value) setDay(event.target.value);
              }}
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-2 pb-2">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(event) => {
                setOnlyMine(event.target.checked);
              }}
              className="size-4"
            />
            {t('rooms.onlyMine')}
          </label>
        </div>

        {(rooms.isPending || bookings.isPending) && <Loading />}
        {rooms.data && roomList.length === 0 && (
          <EmptyState
            icon={DoorOpen}
            title={t('rooms.noRooms')}
            text={isAdmin ? t('rooms.noRoomsText') : t('rooms.noRoomsMember')}
          />
        )}
        <ul className="grid gap-4 xl:grid-cols-2">
          {roomList.map((item) => {
            const own = (bookings.data?.bookings ?? []).filter((b) => b.roomId === item.id);
            return (
              <Card as="li" key={item.id} className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold" dir="auto">
                      {item.name}
                    </h3>
                    {(item.location ?? item.capacity) !== null && (
                      <p className="text-sm text-gray-700 dark:text-gray-300" dir="auto">
                        {[
                          item.location ?? '',
                          item.capacity ? t('rooms.seats', { count: item.capacity }) : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    // Starts with the visible text (WCAG 2.5.3), then names the room.
                    aria-label={t('rooms.bookRoom', { room: item.name })}
                    onClick={() => {
                      openBooking(item.id);
                    }}
                  >
                    {t('rooms.book')}
                  </Button>
                </div>
                <Timeline bookings={own} day={day} />
                {own.length === 0 ? (
                  <p className="text-gray-700 dark:text-gray-300">{t('rooms.noBookings')}</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
                    {own.map((b) => (
                      <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                        <span className="font-bold tabular-nums" dir="ltr">
                          {time(b.startsAt)}–{time(b.endsAt)}
                        </span>
                        <span className="min-w-0 flex-1" dir="auto">
                          {b.title ?? t('rooms.untitled')}
                        </span>
                        {b.atScreen ? (
                          <StatusPill tone="amber">{t('rooms.atScreen')}</StatusPill>
                        ) : (
                          b.bookedBy && (
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {t('rooms.bookedBy', { name: b.bookedBy.name ?? '—' })}
                            </span>
                          )
                        )}
                        {b.canEdit && (
                          <span className="flex gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={`${t('rooms.editBooking')}: ${time(b.startsAt)}, ${item.name}`}
                              onClick={() => {
                                editBooking(b);
                              }}
                            >
                              {t('rooms.editBooking')}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={`${t('rooms.cancelBooking')}: ${time(b.startsAt)}, ${item.name}`}
                              onClick={() => {
                                setCancelling(b);
                              }}
                            >
                              {t('rooms.cancelBooking')}
                            </Button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </ul>
        {roomList.length > 0 && (
          <p className="mt-4 max-w-3xl text-sm text-gray-700 dark:text-gray-300">
            {t('rooms.screenHint')}
          </p>
        )}
      </section>

      {isAdmin && (
        <>
          <section aria-labelledby="rooms-manage-heading" className="mb-10 max-w-3xl">
            <SectionHeading
              id="rooms-manage-heading"
              title={t('rooms.manage')}
              description={t('rooms.manageHint')}
            />
            <ul className="mb-4 flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
              {roomList.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 font-medium" dir="auto">
                    {item.name}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={`${t('rooms.editRoom')}: ${item.name}`}
                    onClick={() => {
                      saveRoom.reset();
                      setRoom({
                        id: item.id,
                        name: item.name,
                        location: item.location ?? '',
                        capacity: item.capacity ? String(item.capacity) : '',
                        showTitles: item.showTitles,
                      });
                    }}
                  >
                    {t('rooms.editRoom')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={`${t('rooms.deleteRoom')}: ${item.name}`}
                    onClick={() => {
                      setDeleting(item);
                    }}
                  >
                    {t('rooms.deleteRoom')}
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              onClick={() => {
                saveRoom.reset();
                setRoom({ id: null, name: '', location: '', capacity: '', showTitles: false });
              }}
            >
              {t('rooms.addRoom')}
            </Button>
          </section>

          <PinSection orgId={orgId} pinSet={rooms.data?.pinSet ?? false} onSaved={refresh} />
        </>
      )}

      {booking && (
        <BookingDialog
          draft={booking}
          rooms={roomList}
          saving={saveBooking.isPending}
          error={saveBooking.error}
          onClose={() => {
            setBooking(null);
          }}
          onSave={(draft) => {
            saveBooking.mutate(draft);
          }}
        />
      )}
      {room && (
        <RoomDialog
          draft={room}
          saving={saveRoom.isPending}
          error={saveRoom.error}
          onClose={() => {
            setRoom(null);
          }}
          onSave={(draft) => {
            saveRoom.mutate(draft);
          }}
        />
      )}
      <ConfirmDialog
        open={cancelling !== null}
        message={
          cancelling
            ? t('rooms.cancelConfirm', {
                when: `${time(cancelling.startsAt)}–${time(cancelling.endsAt)}`,
                room: roomName(cancelling.roomId),
              })
            : ''
        }
        confirmLabel={t('rooms.cancelBooking')}
        loading={cancelBooking.isPending}
        onCancel={() => {
          setCancelling(null);
        }}
        onConfirm={() => {
          if (cancelling) cancelBooking.mutate(cancelling);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        message={deleting ? t('rooms.deleteConfirm', { room: deleting.name }) : ''}
        confirmLabel={t('rooms.deleteRoom')}
        loading={deleteRoom.isPending}
        onCancel={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          if (deleting) deleteRoom.mutate(deleting);
        }}
      />
    </>
  );
}

/**
 * The day's busy times as bars (decorative: the list under it says the same in text). The
 * board runs 07:00–21:00, wider when a booking is outside it.
 */
function Timeline({ bookings, day }: { bookings: RoomBookingItem[]; day: string }) {
  const { t } = useTranslation();
  const start = startOfDay(day).getTime();
  let fromHour = BOARD_FROM;
  let toHour = BOARD_TO;
  for (const b of bookings) {
    fromHour = Math.min(fromHour, Math.floor((Date.parse(b.startsAt) - start) / 3_600_000));
    toHour = Math.max(toHour, Math.ceil((Date.parse(b.endsAt) - start) / 3_600_000));
  }
  fromHour = Math.max(0, fromHour);
  toHour = Math.min(24, toHour);
  const span = (toHour - fromHour) * 3_600_000;
  const left = start + fromHour * 3_600_000;
  return (
    <div
      aria-hidden="true"
      title={t('rooms.timeline', { from: `${pad(fromHour)}:00`, to: `${pad(toHour)}:00` })}
    >
      <div
        className="relative h-5 overflow-hidden rounded bg-green-100 dark:bg-green-950"
        dir="ltr"
      >
        {bookings.map((b) => {
          const a = Math.max(0, (Date.parse(b.startsAt) - left) / span);
          const z = Math.min(1, (Date.parse(b.endsAt) - left) / span);
          return (
            <span
              key={b.id}
              className="absolute top-0 bottom-0 bg-red-700 dark:bg-red-500"
              style={{
                left: `${String(a * 100)}%`,
                width: `${String(Math.max(0.5, (z - a) * 100))}%`,
              }}
            />
          );
        })}
      </div>
      <div
        className="mt-0.5 flex justify-between text-xs text-gray-700 dark:text-gray-300"
        dir="ltr"
      >
        <span>{pad(fromHour)}:00</span>
        <span>{pad(toHour === 24 ? 0 : toHour)}:00</span>
      </div>
    </div>
  );
}

function BookingDialog(props: {
  draft: BookingDraft;
  rooms: RoomItem[];
  saving: boolean;
  error: unknown;
  onClose: () => void;
  onSave: (draft: BookingDraft) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [draft, setDraft] = useState(props.draft);
  const [invalid, setInvalid] = useState(false);
  const errors = useFormErrors(props.error);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const start = localInstant(draft.day, draft.from).getTime();
    const end = localInstant(draft.day, draft.to).getTime();
    const bad = !(end > start) || end - start > 12 * 3_600_000 || Number.isNaN(start);
    setInvalid(bad);
    if (!bad) props.onSave(draft);
  };

  return (
    <Dialog
      open
      onClose={props.onClose}
      title={draft.id ? t('rooms.editBooking') : t('rooms.book')}
      footer={
        <>
          <Button variant="secondary" onClick={props.onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={`${id}-form`} loading={props.saving}>
            {t('rooms.save')}
          </Button>
        </>
      }
    >
      <form id={`${id}-form`} noValidate className="flex flex-col gap-4" onSubmit={submit}>
        {errors.form && <Alert variant="error">{errors.form}</Alert>}
        {invalid && (
          <p role="alert" className="font-medium text-red-800 dark:text-red-300">
            {t('rooms.invalidTimes')}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-room`} className="font-medium">
            {t('rooms.room')}
          </label>
          <select
            id={`${id}-room`}
            value={draft.roomId}
            onChange={(event) => {
              setDraft({ ...draft, roomId: event.target.value });
            }}
            className={`${inputClass} bg-white`}
          >
            {props.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </div>
        <Field
          label={t('rooms.date')}
          name="day"
          type="date"
          required
          value={draft.day}
          onChange={(event) => {
            setDraft({ ...draft, day: event.target.value });
          }}
          error={errors.fields.startsAt}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('rooms.from')}
            name="from"
            type="time"
            required
            step={300}
            value={draft.from}
            onChange={(event) => {
              setDraft({ ...draft, from: event.target.value });
            }}
          />
          <Field
            label={t('rooms.to')}
            name="to"
            type="time"
            required
            step={300}
            value={draft.to}
            onChange={(event) => {
              setDraft({ ...draft, to: event.target.value });
            }}
            error={errors.fields.endsAt}
          />
        </div>
        <Field
          label={t('rooms.meetingTitle')}
          hint={t('rooms.meetingTitleHint')}
          name="title"
          maxLength={120}
          dir="auto"
          value={draft.title}
          onChange={(event) => {
            setDraft({ ...draft, title: event.target.value });
          }}
          error={errors.fields.title}
        />
      </form>
    </Dialog>
  );
}

function RoomDialog(props: {
  draft: RoomDraft;
  saving: boolean;
  error: unknown;
  onClose: () => void;
  onSave: (draft: RoomDraft) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [draft, setDraft] = useState(props.draft);
  const errors = useFormErrors(props.error);
  return (
    <Dialog
      open
      onClose={props.onClose}
      title={draft.id ? t('rooms.editRoom') : t('rooms.addRoom')}
      footer={
        <>
          <Button variant="secondary" onClick={props.onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={`${id}-form`} loading={props.saving}>
            {t('rooms.save')}
          </Button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSave(draft);
        }}
      >
        {errors.form && <Alert variant="error">{errors.form}</Alert>}
        <Field
          label={t('rooms.name')}
          name="name"
          required
          maxLength={80}
          dir="auto"
          value={draft.name}
          onChange={(event) => {
            setDraft({ ...draft, name: event.target.value });
          }}
          error={errors.fields.name}
        />
        <Field
          label={t('rooms.location')}
          name="location"
          maxLength={120}
          dir="auto"
          value={draft.location}
          onChange={(event) => {
            setDraft({ ...draft, location: event.target.value });
          }}
          error={errors.fields.location}
        />
        <Field
          label={t('rooms.capacity')}
          name="capacity"
          type="number"
          min={1}
          max={1000}
          inputMode="numeric"
          value={draft.capacity}
          onChange={(event) => {
            setDraft({ ...draft, capacity: event.target.value });
          }}
          error={errors.fields.capacity}
        />
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <input
              id={`${id}-titles`}
              type="checkbox"
              checked={draft.showTitles}
              aria-describedby={`${id}-titles-hint`}
              onChange={(event) => {
                setDraft({ ...draft, showTitles: event.target.checked });
              }}
              className="size-5"
            />
            <label htmlFor={`${id}-titles`} className="font-medium">
              {t('rooms.showTitles')}
            </label>
          </div>
          <p id={`${id}-titles-hint`} className="text-sm text-gray-700 dark:text-gray-300">
            {t('rooms.showTitlesHint')}
          </p>
        </div>
      </form>
    </Dialog>
  );
}

/** The organization's PIN for booking at screens (stored hashed; never shown again). */
function PinSection({
  orgId,
  pinSet,
  onSaved,
}: {
  orgId: string;
  pinSet: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (value: string | null) =>
      put<{ pinSet: boolean }>(`/api/v1/orgs/${orgId}/settings/room-pin`, { pin: value }),
    onSuccess: ({ pinSet: on }) => {
      setPin('');
      setNotice(on ? t('rooms.pinSaved') : t('rooms.pinCleared'));
      onSaved();
    },
  });
  const errors = useFormErrors(save.error);
  return (
    <section aria-labelledby="rooms-pin-heading" className="mb-10 max-w-3xl">
      <SectionHeading
        id="rooms-pin-heading"
        title={t('rooms.pin')}
        description={t('rooms.pinHint')}
      />
      <Card className="flex flex-col gap-4 p-5">
        <p>
          <StatusPill tone={pinSet ? 'green' : 'gray'}>
            {pinSet ? t('rooms.pinOn') : t('rooms.pinOff')}
          </StatusPill>
        </p>
        <div aria-live="polite" className="empty:hidden">
          {notice && <Alert variant="success">{notice}</Alert>}
        </div>
        {errors.form && <Alert variant="error">{errors.form}</Alert>}
        <form
          noValidate
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const ok = /^\d{4,8}$/.test(pin);
            setInvalid(!ok);
            if (ok) save.mutate(pin);
          }}
        >
          <Field
            label={t('rooms.newPin')}
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            dir="ltr"
            value={pin}
            onChange={(event) => {
              setPin(event.target.value.replace(/\D/g, ''));
            }}
            error={invalid ? t('rooms.pinInvalid') : errors.fields.pin}
          />
          <Button type="submit" loading={save.isPending && save.variables !== null}>
            {t('rooms.setPin')}
          </Button>
          {pinSet && (
            <Button
              variant="secondary"
              loading={save.isPending && save.variables === null}
              onClick={() => {
                save.mutate(null);
              }}
            >
              {t('rooms.clearPin')}
            </Button>
          )}
        </form>
      </Card>
    </section>
  );
}
