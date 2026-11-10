import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../lib/cn';

/*
 * Form controls (STYLES.md desktop adaptation): 8px radius, Silver Lining hairline,
 * Indigo Navy border on focus, 14px text. Labels are always visible.
 */

const CONTROL =
  'w-full rounded-control border border-silver-lining bg-pure-white px-3 text-sm text-slate-ink placeholder:text-fog transition-colors focus:border-indigo-navy focus:outline-none focus-visible:outline-none aria-invalid:border-signal-orange disabled:bg-cloud-canvas';

interface FieldProps {
  label: ReactNode;
  /** Validation message from the form. */
  error?: string;
  hint?: ReactNode;
  /** Renders the control with the ids it needs for labelling and errors. */
  children: (control: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
  className?: string;
  /**
   * `false` for composite controls that label their own input (e.g. the tool picker, whose
   * library sets the input id): the title is shown as text instead of a `<label for>`.
   */
  labelsControl?: boolean;
}

/** Label + control + hint + error, wired for screen readers. */
export function Field({
  label,
  error,
  hint,
  children,
  className,
  labelsControl = true,
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;
  const LabelTag = labelsControl ? 'label' : 'span';

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <LabelTag
        {...(labelsControl ? { htmlFor: id } : {})}
        className="text-sm font-medium text-slate-ink"
      >
        {label}
      </LabelTag>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && !error && (
        <p id={hintId} className="text-sm text-steel-text">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-2 text-sm text-slate-ink">
          <span
            aria-hidden="true"
            className="mt-1.5 size-2 shrink-0 rounded-full bg-signal-orange"
          />
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(CONTROL, 'h-9', className)} {...props} />;
}

export function Textarea({
  className,
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <textarea ref={ref} className={cn(CONTROL, 'min-h-20 py-2 leading-5', className)} {...props} />
  );
}

export function Select({
  className,
  ref,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return <select ref={ref} className={cn(CONTROL, 'h-9 pr-8', className)} {...props} />;
}

export function Checkbox({
  label,
  className,
  ref,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode;
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <label className={cn('inline-flex items-center gap-2 text-sm text-slate-ink', className)}>
      <input ref={ref} type="checkbox" className="size-4 accent-indigo-navy" {...props} />
      {label}
    </label>
  );
}
