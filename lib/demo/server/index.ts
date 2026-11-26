import "server-only";

import * as chain from "./chain";
import { readDemoServerConfig } from "./config";
import { createDemoHandlers } from "./handlers";
import * as passkeys from "./passkeys";
import { demoPasskeyStore } from "./store";

/** The demo API, wired to Stellar testnet, the bundler key and the database. */
export const demoApi = createDemoHandlers({
  config: () => readDemoServerConfig(),
  store: demoPasskeyStore,
  chain,
  passkeys,
});
