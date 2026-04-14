/**
 * Package version — sourced from package.json so reports, CLI banners,
 * and footers stay in sync with the published version automatically.
 */

import pkg from '../package.json' with { type: 'json' };

export const VERSION: string = pkg.version;
