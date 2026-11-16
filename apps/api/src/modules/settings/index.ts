// Public API of the settings module: other modules import only from here.
export { SettingsModule } from './settings.module.js';
/** Preferences and namespaced key/value storage for other modules' non-secret settings. */
export { SettingsService } from './application/settings.service.js';
