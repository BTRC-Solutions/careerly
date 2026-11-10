import type {
  Achievement,
  Certification,
  Education,
  LanguageSkill,
  PersonalInfo,
  Position,
  Project,
} from '@careerly/contracts';

/*
 * Persistence ports of the profile module. Declared as abstract classes so they work as Nest DI tokens.
 * Writes that touch several rows (an element and its tool links) are atomic.
 */

/** Fields every new profile element is created with (RF-PROF-07). */
export interface NewElement {
  id: string;
  /** Always `MANUAL` from the HTTP API for now; `GAP_ANSWER` arrives with tailoring (F5/F2.6). */
  origin: 'MANUAL' | 'IMPORT' | 'GAP_ANSWER';
  originSessionId: string | null;
  now: string;
}

type Writable<T> = Omit<T, 'id' | 'origin' | 'originSessionId' | 'createdAt' | 'updatedAt'>;

export type PersonalInfoFields = Omit<PersonalInfo, 'updatedAt'>;
export type PositionFields = Omit<Writable<Position>, 'tools' | 'achievements'>;
export type ProjectFields = Omit<Writable<Project>, 'tools' | 'achievements'>;
export type AchievementFields = Omit<Writable<Achievement>, 'tools'>;
export type EducationFields = Writable<Education>;
export type CertificationFields = Writable<Certification>;
export type LanguageSkillFields = Writable<LanguageSkill>;

/** Positions and projects both hold achievements and tools. */
export type ContainerKind = 'position' | 'project';
export interface AchievementParent {
  kind: ContainerKind;
  id: string;
}

export abstract class PersonalInfoRepository {
  abstract get(): Promise<PersonalInfo>;
  abstract save(fields: PersonalInfoFields, now: string): Promise<PersonalInfo>;
}

export abstract class ExperienceRepository {
  abstract listPositions(): Promise<Position[]>;
  abstract findPosition(id: string): Promise<Position | undefined>;
  abstract insertPosition(
    element: NewElement,
    fields: PositionFields,
    toolIds: string[],
  ): Promise<void>;

  abstract listProjects(): Promise<Project[]>;
  abstract findProject(id: string): Promise<Project | undefined>;
  abstract insertProject(
    element: NewElement,
    fields: ProjectFields,
    toolIds: string[],
  ): Promise<void>;

  /** Updates the given fields; `toolIds`, when present, replaces the whole list. */
  abstract updateContainer(
    kind: ContainerKind,
    id: string,
    fields: Partial<PositionFields> | Partial<ProjectFields>,
    toolIds: string[] | undefined,
    now: string,
  ): Promise<void>;
  /** Deletes the element with its achievements and tool links. Returns false if it did not exist. */
  abstract deleteContainer(kind: ContainerKind, id: string): Promise<boolean>;

  abstract findAchievement(
    id: string,
  ): Promise<{ achievement: Achievement; parent: AchievementParent } | undefined>;
  abstract listAchievementIds(parent: AchievementParent): Promise<string[]>;
  /** Appends the achievement at the end of its parent's list. */
  abstract insertAchievement(
    parent: AchievementParent,
    element: NewElement,
    fields: AchievementFields,
    toolIds: string[],
  ): Promise<void>;
  abstract updateAchievement(
    id: string,
    fields: Partial<AchievementFields>,
    toolIds: string[] | undefined,
    now: string,
  ): Promise<void>;
  abstract deleteAchievement(id: string): Promise<boolean>;
  /** Stores the given order (ids must be exactly the parent's achievements). */
  abstract reorderAchievements(parent: AchievementParent, orderedIds: string[]): Promise<void>;

  /** Which of these tool ids exist in the catalog. */
  abstract findExistingToolIds(ids: string[]): Promise<Set<string>>;
}

/** Education, certifications and languages: flat elements without children. */
export type SimpleSection = 'education' | 'certifications' | 'languages';

export interface SimpleSectionTypes {
  education: { item: Education; fields: EducationFields };
  certifications: { item: Certification; fields: CertificationFields };
  languages: { item: LanguageSkill; fields: LanguageSkillFields };
}

export abstract class SimpleSectionRepository {
  abstract list<S extends SimpleSection>(section: S): Promise<SimpleSectionTypes[S]['item'][]>;
  abstract find<S extends SimpleSection>(
    section: S,
    id: string,
  ): Promise<SimpleSectionTypes[S]['item'] | undefined>;
  abstract insert<S extends SimpleSection>(
    section: S,
    element: NewElement,
    fields: SimpleSectionTypes[S]['fields'],
  ): Promise<void>;
  abstract update<S extends SimpleSection>(
    section: S,
    id: string,
    fields: Partial<SimpleSectionTypes[S]['fields']>,
    now: string,
  ): Promise<void>;
  abstract delete(section: SimpleSection, id: string): Promise<boolean>;
}
