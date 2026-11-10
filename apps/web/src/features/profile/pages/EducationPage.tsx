import type { Certification, Education } from '@careerly/contracts';
import { useTranslation } from 'react-i18next';
import {
  useCreateCertification,
  useCreateEducation,
  useDeleteFromSection,
  useUpdateCertification,
  useUpdateEducation,
} from '../api/profile-api';
import { EditableList } from '../components/EditableList';
import { WithProfile } from '../components/ProfileLayout';
import { CertificationForm, EducationForm } from '../components/SectionForms';
import { formatMonth, formatMonthRange } from '../lib/dates';

/** Education, courses and certifications (RF-PROF-05). */
export function EducationPage() {
  const { t, i18n } = useTranslation();
  const createEducation = useCreateEducation();
  const updateEducation = useUpdateEducation();
  const deleteEducation = useDeleteFromSection('education');
  const createCertification = useCreateCertification();
  const updateCertification = useUpdateCertification();
  const deleteCertification = useDeleteFromSection('certifications');

  return (
    <WithProfile>
      {(profile) => (
        <div className="flex flex-col gap-6">
          <EditableList<Education>
            title={t('profile.education.title')}
            addLabel={t('profile.education.add')}
            emptyLabel={t('profile.education.empty')}
            items={profile.education}
            nameOf={(item) => item.title}
            describe={(item) => ({
              primary: item.title,
              secondary: [
                item.institution,
                t(`profile.enums.educationKind.${item.kind}`),
                item.field,
              ]
                .filter(Boolean)
                .join(' · '),
              aside: formatMonthRange(
                item.startDate,
                item.endDate,
                i18n.language,
                t('profile.dates.inProgress'),
              ),
            })}
            renderForm={({ item, close }) => {
              const mutation = item ? updateEducation : createEducation;
              return (
                <EducationForm
                  initial={item}
                  submitLabel={item ? undefined : t('common.create')}
                  pending={mutation.isPending}
                  error={mutation.error}
                  onCancel={close}
                  onSubmit={async (body) => {
                    if (item) await updateEducation.mutateAsync({ id: item.id, body });
                    else await createEducation.mutateAsync(body);
                    close();
                  }}
                />
              );
            }}
            onDelete={(item) => deleteEducation.mutateAsync(item.id)}
          />

          <EditableList<Certification>
            title={t('profile.certifications.title')}
            addLabel={t('profile.certifications.add')}
            emptyLabel={t('profile.certifications.empty')}
            items={profile.certifications}
            nameOf={(item) => item.name}
            describe={(item) => ({
              primary: item.name,
              secondary: item.issuer ?? undefined,
              aside: item.issueDate ? formatMonth(item.issueDate, i18n.language) : undefined,
            })}
            renderForm={({ item, close }) => {
              const mutation = item ? updateCertification : createCertification;
              return (
                <CertificationForm
                  initial={item}
                  submitLabel={item ? undefined : t('common.create')}
                  pending={mutation.isPending}
                  error={mutation.error}
                  onCancel={close}
                  onSubmit={async (body) => {
                    if (item) await updateCertification.mutateAsync({ id: item.id, body });
                    else await createCertification.mutateAsync(body);
                    close();
                  }}
                />
              );
            }}
            onDelete={(item) => deleteCertification.mutateAsync(item.id)}
          />
        </div>
      )}
    </WithProfile>
  );
}
