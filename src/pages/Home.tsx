import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router";
import PhoneFrame from "../components/PhoneFrame";
import DesktopSidebar from "../components/DesktopSidebar";
import FullLoader from "../components/FullLoader";
import MobileCanvasGate from "../components/MobileCanvasGate";
import CanvasScreen from "../sections/CanvasScreen";
import TemplatesScreen from "../sections/TemplatesScreen";
import OrgScreen from "../sections/OrgScreen";
import StatsScreen from "../sections/StatsScreen";
import SettingsScreen from "../sections/SettingsScreen";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { api } from "../lib/api";
import type { PublicUser } from "../lib/contract";
import type { Screen } from "../types";

export default function Home() {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [screen, setScreen] = useState<Screen>("canvas");
  const [scenarioKey, setScenarioKey] = useState(1);
  const [builderAck, setBuilderAck] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const navigate = useNavigate();
  // undefined = still checking; null = signed out; PublicUser = signed in.
  const [me, setMe] = useState<PublicUser | null | undefined>(undefined);

  // Fresh signups answer three onboarding questions before the builder.
  // While the check runs we show the brand loader so the canvas never
  // flashes before the redirect.
  useEffect(() => {
    let cancelled = false;
    api.auth
      .me()
      .then((u) => {
        if (cancelled) return;
        setMe(u);
        if (u && !u.onboarded) navigate("/onboarding", { replace: true });
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (me === undefined) return <FullLoader />;

  const newScenario = () => {
    // The canvas remounts and restores the last flow on boot - a brand-new
    // scenario must skip that restore once and start blank.
    sessionStorage.setItem("stringz:skip-restore", "1");
    setScenarioKey((k) => k + 1);
    setNotice("New blank scenario created");
    setScreen("canvas");
  };

  const content = (desktop: boolean) => (
    <AnimatePresence mode="wait">
      <motion.div
        key={screen}
        className="h-full w-full"
        initial={{ opacity: 0, x: screen === "canvas" ? -28 : 28 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: screen === "canvas" ? 28 : -28 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        {screen === "canvas" && (
          <CanvasScreen
            key={scenarioKey}
            desktop={desktop}
            notice={notice}
            signedIn={me !== null}
            onNavigate={setScreen}
            onNewScenario={newScenario}
          />
        )}
        {screen === "templates" && <TemplatesScreen desktop={desktop} onBack={() => setScreen("canvas")} />}
        {screen === "org" && (
          <OrgScreen
            desktop={desktop}
            onBack={() => setScreen("canvas")}
            onNewScenario={newScenario}
            onOpenSettings={() => setScreen("settings")}
          />
        )}
        {screen === "stats" && <StatsScreen desktop={desktop} onBack={() => setScreen("canvas")} />}
        {screen === "settings" && <SettingsScreen desktop={desktop} onBack={() => setScreen("canvas")} />}
      </motion.div>
    </AnimatePresence>
  );

  if (isDesktop) {
    return (
      <div className="flex h-[100dvh] w-full overflow-hidden bg-white">
        <DesktopSidebar active={screen} onNavigate={setScreen} user={me} />
        <div className="relative min-w-0 flex-1">{content(true)}</div>
      </div>
    );
  }

  return (
    <PhoneFrame>
      {screen === "canvas" && !builderAck ? (
        <MobileCanvasGate onContinue={() => setBuilderAck(true)} />
      ) : (
        content(false)
      )}
    </PhoneFrame>
  );
}
