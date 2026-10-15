import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Dialog } from './Dialog';
import { Alert } from './Alert';
import { Button } from './Button';
import { clearPreferences } from '../lib/storage';

/**
 * "Privacy & cookie settings" — permanently reachable from the footer. Rubinny
 * itself uses only an essential session cookie, so there is nothing to opt into;
 * the dialog explains what is stored and lets users clear local preferences.
 */
export function PrivacySettingsButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [cleared, setCleared] = useState(false);

  return (
    <>
      <button
        type="button"
        className="underline hover:no-underline"
        onClick={() => {
          setCleared(false);
          setOpen(true);
        }}
      >
        {t('footer.privacySettings')}
      </button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title={t('privacySettings.title')}
      >
        <div className="flex flex-col gap-4">
          <p>{t('privacySettings.intro')}</p>
          <section>
            <h3 className="font-semibold">{t('privacySettings.essential')}</h3>
            <p>{t('privacySettings.essentialItems')}</p>
          </section>
          <section>
            <h3 className="font-semibold">{t('privacySettings.preferences')}</h3>
            <p>{t('privacySettings.preferencesItems')}</p>
            <Button
              variant="secondary"
              className="mt-2"
              onClick={() => {
                clearPreferences();
                setCleared(true);
              }}
            >
              {t('privacySettings.clearPreferences')}
            </Button>
          </section>
          {cleared && <Alert variant="success">{t('privacySettings.cleared')}</Alert>}
          <Link
            to="/cookies"
            className="text-brand-700 underline dark:text-brand-300"
            onClick={() => {
              setOpen(false);
            }}
          >
            {t('privacySettings.more')}
          </Link>
        </div>
      </Dialog>
    </>
  );
}
