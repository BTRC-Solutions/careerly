import type { LanguageSkill } from '@careerly/contracts';
import { useTranslation } from 'react-i18next';
import { useCreateLanguage, useDeleteFromSection, useUpdateLanguage } from '../api/profile-api';
import { EditableList } from '../components/EditableList';
import { WithProfile } from '../components/ProfileLayout';
import { LanguageForm } from '../components/SectionForms';

/** Languages with their level (RF-PROF-05). */
export function LanguagesPage() {
  const { t } = useTranslation();
  const createLanguage = useCreateLanguage();
  const updateLanguage = useUpdateLanguage();
  const deleteLanguage = useDeleteFromSection('languages');

  return (
    <WithProfile>
      {(profile) => (
        <EditableList<LanguageSkill>
          title={t('profile.languages.title')}
          addLabel={t('profile.languages.add')}
          emptyLabel={t('profile.languages.empty')}
          items={profile.languages}
          nameOf={(item) => item.language}
          describe={(item) => ({
            primary: item.language,
            secondary: item.notes ?? undefined,
            aside: t(`profile.enums.languageLevel.${item.level}`),
          })}
          renderForm={({ item, close }) => {
            const mutation = item ? updateLanguage : createLanguage;
            return (
              <LanguageForm
                initial={item}
                submitLabel={item ? undefined : t('common.create')}
                pending={mutation.isPending}
                error={mutation.error}
                onCancel={close}
                onSubmit={async (body) => {
                  if (item) await updateLanguage.mutateAsync({ id: item.id, body });
                  else await createLanguage.mutateAsync(body);
                  close();
                }}
              />
            );
          }}
          onDelete={(item) => deleteLanguage.mutateAsync(item.id)}
        />
      )}
    </WithProfile>
  );
}
