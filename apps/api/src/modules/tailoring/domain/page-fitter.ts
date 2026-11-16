/*
 * Page fitter (ARCHITECTURE.md §8, ADR-05): picks which bullets of a tailored CV fit the page budget. It is
 * deterministic and pure: the only way it learns how long a CV is, is the `measure` function it is given
 * (in the app, a Typst render that returns the page count; in tests, a fake).
 *
 * 1. Initial rules: current position up to 5 bullets, positions of the last ~10 years up to 3, older ones only
 *    company, title and dates (RN-07: they stay, so there are no unexplained gaps); projects only when
 *    relevant. Positions in reverse chronological order, bullets by score (RN-06).
 * 2. While the CV is over budget, remove the lowest-scored bullet, keeping at least one per recent position.
 *    If it still does not fit, the result says so (RN-04: finalizing needs the user's confirmation).
 * 3. While there is room, add back the best-scored bullets left out, as long as the CV still fits.
 * 4. The log tells the user what was left out and why, and what was added to fill the space.
 */

/** "2023-04". */
type YearMonth = string;

export interface BulletCandidate {
  id: string;
  /** Relevance for the job description, 0–1. */
  score: number;
}

export interface PositionCandidate {
  id: string;
  startDate: YearMonth;
  /** `null` while current. */
  endDate: YearMonth | null;
  bullets: BulletCandidate[];
}

export interface ProjectCandidate {
  id: string;
  /** Marked as relevant by the user or covering a requirement of the job description. */
  relevant: boolean;
  bullets: BulletCandidate[];
}

export interface FitCandidates {
  positions: PositionCandidate[];
  projects: ProjectCandidate[];
}

/** What goes into the CV, in display order. Every position is kept; only included projects are listed. */
export interface FitSelection {
  positions: { id: string; bulletIds: string[] }[];
  projects: { id: string; bulletIds: string[] }[];
}

/** Renders a selection and returns its number of pages. */
export type Measure = (selection: FitSelection) => Promise<number>;

export interface FitRules {
  currentMaxBullets: number;
  recentMaxBullets: number;
  /** Positions that ended within these many years are "recent". */
  recentYears: number;
  projectMaxBullets: number;
  /** Bullets a recent position keeps when trimming, if it has any. */
  minBulletsPerRecentPosition: number;
  /** Upper bound on renders, so a fit always ends quickly (RNF-08). */
  maxMeasurements: number;
}

export const DEFAULT_FIT_RULES: FitRules = {
  currentMaxBullets: 5,
  recentMaxBullets: 3,
  recentYears: 10,
  projectMaxBullets: 3,
  minBulletsPerRecentPosition: 1,
  maxMeasurements: 30,
};

export type FitReason =
  'OLD_POSITION' | 'SECTION_LIMIT' | 'NOT_RELEVANT' | 'OVER_BUDGET' | 'SPACE_LEFT';

export interface FitLogEntry {
  owner: { type: 'position' | 'project'; id: string };
  /** `null` when the entry is about a whole project. */
  bulletId: string | null;
  action: 'LEFT_OUT' | 'ADDED';
  reason: FitReason;
}

export interface FitResult {
  selection: FitSelection;
  pageCount: number;
  fits: boolean;
  log: FitLogEntry[];
}

export interface FitOptions {
  pageBudget: number;
  /** The current month, to tell recent positions from old ones. */
  today: YearMonth;
  rules?: Partial<FitRules>;
}

type Tier = 'CURRENT' | 'RECENT' | 'OLD' | 'PROJECT' | 'IRRELEVANT_PROJECT';

interface Owner {
  type: 'position' | 'project';
  id: string;
  tier: Tier;
  /** Display order of the owner: positions first (newest first), then projects. */
  order: number;
  bullets: BulletCandidate[];
  included: Set<string>;
  minBullets: number;
}

interface Slot {
  owner: Owner;
  bullet: BulletCandidate;
  /** Position of the bullet inside its owner, by score: used to break ties. */
  rank: number;
}

export async function fitToPages(
  candidates: FitCandidates,
  measure: Measure,
  options: FitOptions,
): Promise<FitResult> {
  const rules = { ...DEFAULT_FIT_RULES, ...options.rules };
  const owners = initialOwners(candidates, rules, options.today);
  const reasons = new Map<string, FitReason>();
  const slots = owners.flatMap((owner) =>
    owner.bullets.map((bullet, rank): Slot => ({ owner, bullet, rank })),
  );

  // 1. Initial rules.
  for (const { owner, bullet } of slots) {
    if (!owner.included.has(bullet.id))
      reasons.set(key(owner, bullet.id), initialReason(owner.tier));
  }

  let measurements = 0;
  const measureNow = async () => {
    measurements += 1;
    return measure(selectionOf(owners));
  };
  let pageCount = await measureNow();

  // 2. Trim: lowest score first; on ties, the later owner and the later bullet go first.
  while (pageCount > options.pageBudget && measurements < rules.maxMeasurements) {
    const removable = slots
      .filter(
        ({ owner, bullet }) =>
          owner.included.has(bullet.id) && owner.included.size > owner.minBullets,
      )
      .sort(
        (a, b) =>
          a.bullet.score - b.bullet.score || b.owner.order - a.owner.order || b.rank - a.rank,
      );
    const victim = removable[0];
    if (!victim) break;
    victim.owner.included.delete(victim.bullet.id);
    reasons.set(key(victim.owner, victim.bullet.id), 'OVER_BUDGET');
    pageCount = await measureNow();
  }

  // 3. Fill: best score first; a bullet that makes the CV too long is taken back out.
  if (pageCount <= options.pageBudget) {
    const fillable = slots
      .filter(({ owner, bullet }) => canFill(owner) && !owner.included.has(bullet.id))
      .sort(
        (a, b) =>
          b.bullet.score - a.bullet.score || a.owner.order - b.owner.order || a.rank - b.rank,
      );
    for (const { owner, bullet } of fillable) {
      if (measurements >= rules.maxMeasurements) break;
      owner.included.add(bullet.id);
      const pages = await measureNow();
      if (pages <= options.pageBudget) {
        pageCount = pages;
        reasons.set(key(owner, bullet.id), 'SPACE_LEFT');
      } else {
        owner.included.delete(bullet.id);
      }
    }
  }

  return {
    selection: selectionOf(owners),
    pageCount,
    fits: pageCount <= options.pageBudget,
    log: logOf(owners, reasons),
  };
}

function initialOwners(candidates: FitCandidates, rules: FitRules, today: YearMonth): Owner[] {
  const positions = [...candidates.positions].sort(
    (a, b) =>
      compareDesc(a.endDate ?? '9999-99', b.endDate ?? '9999-99') ||
      compareDesc(a.startDate, b.startDate),
  );
  const hasCurrent = positions.some((position) => position.endDate === null);
  const recentFrom = shiftYears(today, -rules.recentYears);

  const owners: Owner[] = positions.map((position, index) => {
    const tier: Tier =
      position.endDate === null || (!hasCurrent && index === 0)
        ? 'CURRENT'
        : position.endDate >= recentFrom
          ? 'RECENT'
          : 'OLD';
    const limit =
      tier === 'CURRENT' ? rules.currentMaxBullets : tier === 'RECENT' ? rules.recentMaxBullets : 0;
    const bullets = byScore(position.bullets);
    return {
      type: 'position',
      id: position.id,
      tier,
      order: index,
      bullets,
      included: new Set(bullets.slice(0, limit).map((bullet) => bullet.id)),
      minBullets: tier === 'OLD' ? 0 : Math.min(rules.minBulletsPerRecentPosition, bullets.length),
    };
  });

  candidates.projects.forEach((project, index) => {
    const bullets = byScore(project.bullets);
    const limit = project.relevant ? rules.projectMaxBullets : 0;
    owners.push({
      type: 'project',
      id: project.id,
      tier: project.relevant ? 'PROJECT' : 'IRRELEVANT_PROJECT',
      order: positions.length + index,
      bullets,
      included: new Set(bullets.slice(0, limit).map((bullet) => bullet.id)),
      minBullets: 0,
    });
  });
  return owners;
}

/** Old positions stay header-only and irrelevant projects stay out, even with room to spare. */
function canFill(owner: Owner): boolean {
  return owner.tier !== 'OLD' && owner.tier !== 'IRRELEVANT_PROJECT';
}

function initialReason(tier: Tier): FitReason {
  return tier === 'OLD'
    ? 'OLD_POSITION'
    : tier === 'IRRELEVANT_PROJECT'
      ? 'NOT_RELEVANT'
      : 'SECTION_LIMIT';
}

/** A project is shown when relevant and it has bullets left (or never had any). */
function projectShown(owner: Owner): boolean {
  return owner.tier === 'PROJECT' && (owner.bullets.length === 0 || owner.included.size > 0);
}

function selectionOf(owners: Owner[]): FitSelection {
  const included = (owner: Owner) => ({
    id: owner.id,
    bulletIds: owner.bullets
      .filter((bullet) => owner.included.has(bullet.id))
      .map((bullet) => bullet.id),
  });
  return {
    positions: owners.filter((owner) => owner.type === 'position').map(included),
    projects: owners
      .filter((owner) => owner.type === 'project' && projectShown(owner))
      .map(included),
  };
}

function logOf(owners: Owner[], reasons: Map<string, FitReason>): FitLogEntry[] {
  const log: FitLogEntry[] = [];
  for (const owner of owners) {
    const ownerRef = { type: owner.type, id: owner.id };
    if (owner.type === 'project' && !projectShown(owner)) {
      log.push({
        owner: ownerRef,
        bulletId: null,
        action: 'LEFT_OUT',
        reason: owner.tier === 'IRRELEVANT_PROJECT' ? 'NOT_RELEVANT' : 'OVER_BUDGET',
      });
      continue;
    }
    for (const bullet of owner.bullets) {
      const reason = reasons.get(key(owner, bullet.id));
      if (owner.included.has(bullet.id)) {
        if (reason === 'SPACE_LEFT') {
          log.push({ owner: ownerRef, bulletId: bullet.id, action: 'ADDED', reason });
        }
      } else if (reason && reason !== 'SPACE_LEFT') {
        log.push({ owner: ownerRef, bulletId: bullet.id, action: 'LEFT_OUT', reason });
      }
    }
  }
  return log;
}

/** Highest score first; stable for ties (keeps the order the bullets came in). */
function byScore(bullets: BulletCandidate[]): BulletCandidate[] {
  return [...bullets].sort((a, b) => b.score - a.score);
}

function key(owner: Owner, bulletId: string): string {
  return `${owner.type}:${owner.id}:${bulletId}`;
}

function compareDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
}

function shiftYears(month: YearMonth, years: number): YearMonth {
  const [year, rest] = month.split('-');
  return `${String(Number(year) + years).padStart(4, '0')}-${rest}`;
}
