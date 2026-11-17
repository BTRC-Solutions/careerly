import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card } from '../../../shared/ui/Card';
import { useTemplates } from '../api/templates-api';

/** CV templates in Settings, with a link to the templates screen (RF-TAIL-09). */
export function TemplatesCard() {
  const { t } = useTranslation();
  const templates = useTemplates();
  const own = templates.data?.filter((template) => !template.builtIn).length;

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-section-title text-indigo-navy">{t('templates.card.title')}</h2>
          <p className="mt-1 text-sm text-steel-text">
            {own === undefined
              ? t('templates.card.description')
              : t('templates.card.count', { count: own })}
          </p>
        </div>
        <Link
          to="/settings/templates"
          className="shrink-0 text-sm font-medium text-indigo-navy underline-offset-4 hover:underline"
        >
          {t('templates.card.manage')}
        </Link>
      </div>
    </Card>
  );
}
