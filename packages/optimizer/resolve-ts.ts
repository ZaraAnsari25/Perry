// Node preload (--import) that lets the storefront's extensionless relative
// imports (import "./catalog") resolve to .ts files, so the baseline search
// module can run outside Next.js.

import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (/^\.\.?\//.test(specifier)) return next(`${specifier}.ts`, context);
      throw error;
    }
  },
});
