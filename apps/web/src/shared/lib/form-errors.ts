import { useTranslation } from 'react-i18next';

/** The parts of a React Hook Form error we read (accepts nested/merged error types too). */
interface ErrorLike {
  type?: unknown;
  message?: unknown;
}

/**
 * Turns a validation error from the shared Zod schemas into a message in the interface language.
 * React Hook Form's zod resolver puts the Zod issue code in `type`.
 */
export function useFieldError() {
  const { t } = useTranslation();
  return (error: ErrorLike | undefined): string | undefined => {
    if (!error) return undefined;
    const message = typeof error.message === 'string' ? error.message : '';
    switch (error.type) {
      case 'invalid_type':
      case 'too_small':
        return t('validation.required');
      case 'too_big':
        return t('validation.tooLong');
      case 'invalid_format':
        return t('validation.invalidFormat');
      case 'invalid_value':
        return t('validation.invalidValue');
      default:
        // Custom form rules use an i18n key as their message (e.g. "validation.endBeforeStart").
        if (message.startsWith('validation.')) return t(message);
        return message || t('validation.invalidValue');
    }
  };
}
