import { useTranslation } from 'react-i18next';
import { Alert } from '../components/Alert';
import { PageHeading } from '../components/PageHeading';
import { formatDate } from '../lib/format';
import { LEGAL } from './legal-content';

export function LegalPage({ doc }: { doc: 'accessibility' | 'privacy' | 'cookies' | 'terms' }) {
  const { t, i18n } = useTranslation();
  const content = LEGAL[i18n.language === 'en' ? 'en' : 'he'][doc];
  return (
    <article>
      <PageHeading title={content.title} />
      <div className="mb-6">
        <Alert variant="warning">{t('common.draftNotice')}</Alert>
      </div>
      <p className="mb-6 text-sm text-gray-700 dark:text-gray-300">
        <time dateTime={content.updated}>{formatDate(content.updated, i18n.language)}</time>
      </p>
      {content.sections.map((section) => (
        <section key={section.heading} className="mb-6">
          <h2 className="mb-2 text-xl font-semibold">{section.heading}</h2>
          {section.paragraphs.length > 2 ? (
            <ul className="list-disc ps-6">
              {section.paragraphs.map((p) => (
                <li key={p} className="mb-1">
                  {p}
                </li>
              ))}
            </ul>
          ) : (
            section.paragraphs.map((p) => (
              <p key={p} className="mb-2">
                {p}
              </p>
            ))
          )}
        </section>
      ))}
    </article>
  );
}
