/** A profile change that breaks a business rule (maps to 400 VALIDATION_FAILED). */
export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileValidationError';
  }
}

/** The referenced profile element does not exist (maps to 404 NOT_FOUND). */
export class ProfileNotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity} not found.`);
    this.name = 'ProfileNotFoundError';
  }
}
