import { showBootFailure } from './lib/boot-failure'
// Renderer entry. The whole app (every store that reads localStorage when its
// module evaluates) enters through the dynamic import below, so nothing can
// read a shared preference before this machine's store hydrated it (#145213),
// in the production chunk graph and in dev's unbundled ESM alike. Keep this
// file's static imports free of app modules.
import { installForeignDomGuard } from './lib/foreign-dom-guard'
import { bootRenderer } from './lib/ui-preferences/boot'

// Before anything mounts: browser translation (the Google Translate extension,
// Chrome's own translate) reparents text nodes, and React's commit throws
// "Failed to execute 'removeChild' on 'Node'" when it removes one of them —
// taking the whole workspace pane down with it. See lib/foreign-dom-guard.ts.
installForeignDomGuard()

void bootRenderer(() => import('./main')).catch(showBootFailure)
