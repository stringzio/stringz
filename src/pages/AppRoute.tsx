import WalletProvider from "../web3/WalletProvider";
import Home from "./Home";

/** /app entry: the web3 provider tree (wagmi + RainbowKit) lives behind this
 *  lazy route so the landing pages don't download the ~1 MB wallet stack. */
export default function AppRoute() {
  return (
    <WalletProvider>
      <Home />
    </WalletProvider>
  );
}
