import Auth from "./Auth";

/** /auth is email + GitHub OAuth only - no wallet stack needed here.
 *  Wallet connection lives on the canvas via RainbowKit/WalletConnect. */
export default function AuthRoute() {
  return <Auth />;
}
