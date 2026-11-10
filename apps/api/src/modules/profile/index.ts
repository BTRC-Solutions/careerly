// Public API of the profile module: other modules import only from here.
export { ProfileModule } from './profile.module.js';
export { ToolCatalogService } from './application/tool-catalog.service.js';
/** Read access to the whole master profile (tailoring reads it through this service). */
export { ProfileService } from './application/profile.service.js';
