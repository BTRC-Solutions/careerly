/* Texts of the public page, in Spanish and English (the browser's language picks one). */

const es = {
  title: 'Careerly en números',
  intro:
    'Estadísticas anónimas de las personas que usan Careerly y eligieron compartirlas. Nunca incluyen CVs, perfiles, empresas ni datos personales.',
  threshold:
    'Cada valor aparece solo si lo reportaron al menos 5 instalaciones distintas; si no, se muestra como «menos de 5».',
  range: 'Período',
  ranges: { 30: 'Últimos 30 días', 90: 'Últimos 90 días', 365: 'Último año' },
  loading: 'Cargando…',
  error: 'Las estadísticas no están disponibles ahora. Probá de nuevo en unos minutos.',
  hidden: 'menos de 5',
  empty: 'Todavía no hay datos suficientes.',
  activeInstalls: 'Instalaciones activas',
  applicationsCreated: 'Postulaciones creadas',
  resumesGenerated: 'CVs generados',
  activeByWeek: 'Instalaciones activas por semana',
  applicationsByWeek: 'Postulaciones creadas por semana',
  weekOf: 'Semana del',
  sources: 'Dónde estaban las ofertas',
  positionCategories: 'Área y seniority de las posiciones',
  positionTitles: 'Títulos más frecuentes',
  funnel: 'Cambios de estado de las postulaciones',
  workMode: 'Modalidad',
  countries: 'Países',
  outputLanguages: 'Idioma de los CVs',
  installs: (n: number) => `${n} instalaciones`,
  footer: 'Careerly es una app de escritorio local: tus datos quedan en tu computadora.',
  labels: {
    other: 'Otros sitios',
    unknown: 'Sin dato',
    remote: 'Remoto',
    hybrid: 'Híbrido',
    onsite: 'Presencial',
    es: 'Español',
    en: 'Inglés',
    SAVED: 'Guardada',
    APPLIED: 'Enviada',
    SCREENING: 'Primer contacto',
    INTERVIEWING: 'Entrevistas',
    OFFER: 'Oferta',
    ACCEPTED: 'Aceptada',
    REJECTED: 'Rechazada',
    WITHDRAWN: 'Retirada',
    GHOSTED: 'Sin respuesta',
  } as Record<string, string>,
};

type Messages = typeof es;

const en: Messages = {
  title: 'Careerly in numbers',
  intro:
    'Anonymous statistics from the people who use Careerly and chose to share them. They never include CVs, profiles, companies or personal data.',
  threshold:
    'A value appears only when at least 5 distinct installations reported it; otherwise it shows as “fewer than 5”.',
  range: 'Period',
  ranges: { 30: 'Last 30 days', 90: 'Last 90 days', 365: 'Last year' },
  loading: 'Loading…',
  error: 'The statistics are not available right now. Try again in a few minutes.',
  hidden: 'fewer than 5',
  empty: 'Not enough data yet.',
  activeInstalls: 'Active installations',
  applicationsCreated: 'Applications created',
  resumesGenerated: 'CVs generated',
  activeByWeek: 'Active installations per week',
  applicationsByWeek: 'Applications created per week',
  weekOf: 'Week of',
  sources: 'Where the job descriptions were',
  positionCategories: 'Area and seniority of the positions',
  positionTitles: 'Most frequent titles',
  funnel: 'Changes of state of the applications',
  workMode: 'Work mode',
  countries: 'Countries',
  outputLanguages: 'Language of the CVs',
  installs: (n: number) => `${n} installations`,
  footer: 'Careerly is a local desktop app: your data stays on your computer.',
  labels: {
    other: 'Other sites',
    unknown: 'Unknown',
    remote: 'Remote',
    hybrid: 'Hybrid',
    onsite: 'On site',
    es: 'Spanish',
    en: 'English',
    SAVED: 'Saved',
    APPLIED: 'Applied',
    SCREENING: 'Screening',
    INTERVIEWING: 'Interviewing',
    OFFER: 'Offer',
    ACCEPTED: 'Accepted',
    REJECTED: 'Rejected',
    WITHDRAWN: 'Withdrawn',
    GHOSTED: 'No answer',
  },
};

export type Language = 'es' | 'en';

export function messagesFor(language: Language): Messages {
  return language === 'es' ? es : en;
}

export function browserLanguage(): Language {
  return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

/** A value's label: a known enum, a country name, or the value itself (a portal's domain). */
export function labelOf(key: string, language: Language): string {
  const known = messagesFor(language).labels[key];
  if (known) return known;
  if (/^[A-Z]{2}$/.test(key)) {
    return new Intl.DisplayNames([language], { type: 'region' }).of(key) ?? key;
  }
  const category = /^([a-z]+):([a-z-]+)$/.exec(key);
  if (category) return `${capitalize(category[1]!)} · ${category[2]}`;
  return key;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
