import { startLoader } from './loader';
import { localServerStore } from './storage';

startLoader(document, {
  store: localServerStore(() => window.localStorage),
  // assign, not replace: Back in the player returns here, to change the server.
  navigate: (url) => {
    window.location.assign(url);
  },
});
