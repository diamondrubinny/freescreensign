import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Wider dialog for galleries. */
  wide?: boolean;
}

/**
 * Modal built on the native <dialog> element: focus is trapped, Escape closes it,
 * the rest of the page is inert, and focus returns to the opener on close.
 */
export function Dialog({ open, onClose, title, children, footer, wide = false }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
      className={`m-auto ${wide ? 'w-[min(56rem,calc(100vw-2rem))]' : 'w-[min(32rem,calc(100vw-2rem))]'} rounded-lg bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/50 dark:bg-gray-900 dark:text-gray-100`}
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id={titleId} className="text-xl font-bold">
          {title}
        </h2>
        <div>{children}</div>
        <div className="flex flex-wrap justify-end gap-2">
          {footer ?? (
            <Button variant="secondary" onClick={onClose}>
              {t('common.close')}
            </Button>
          )}
        </div>
      </div>
    </dialog>
  );
}

export function ConfirmDialog(props: {
  open: boolean;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={props.open}
      onClose={props.onCancel}
      title={t('confirmDialog.title')}
      footer={
        <>
          <Button variant="secondary" onClick={props.onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={props.onConfirm} loading={props.loading ?? false}>
            {props.confirmLabel}
          </Button>
        </>
      }
    >
      <p>{props.message}</p>
    </Dialog>
  );
}
