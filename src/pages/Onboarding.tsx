import { useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Bell, Check } from "lucide-react";
import LogoMark from "../components/LogoMark";
import { api } from "../lib/api";

const ROLES = [
  { key: "developer", label: "Developer" },
  { key: "founder", label: "Founder" },
  { key: "enthusiast", label: "Enthusiast" },
  { key: "other", label: "Other" },
] as const;

const HEARD = [
  { key: "social", label: "Social platforms" },
  { key: "friend", label: "A friend" },
  { key: "invite", label: "Special invite" },
  { key: "other", label: "Other" },
] as const;

type ChoiceProps = {
  options: readonly { key: string; label: string }[];
  value: string | null;
  onPick: (key: string) => void;
  otherValue: string;
  onOtherChange: (v: string) => void;
  otherPlaceholder: string;
};

function Choice({ options, value, onPick, otherValue, onOtherChange, otherPlaceholder }: ChoiceProps) {
  return (
    <div className="space-y-2">
      {options.map((o) => {
        const active = value === o.key;
        return (
          <div key={o.key}>
            <button
              onClick={() => onPick(o.key)}
              className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3.5 text-left text-[14.5px] font-semibold transition active:scale-[0.99] ${
                active ? "border-[#3f6b4f] bg-[#F3F7F4] text-[#1a1a1a]" : "border-gray-100 bg-white text-gray-600"
              }`}
            >
              {o.label}
              {active && <Check size={16} strokeWidth={3} className="text-[#3f6b4f]" />}
            </button>
            {o.key === "other" && active && (
              <motion.input
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                autoFocus
                value={otherValue}
                maxLength={30}
                onChange={(e) => onOtherChange(e.target.value)}
                placeholder={otherPlaceholder}
                className="mt-2 w-full rounded-2xl border-2 border-gray-100 bg-white px-4 py-3 text-[14px] font-medium text-[#1a1a1a] outline-none transition focus:border-[#3f6b4f]"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Three-question post-signup onboarding (Typeform-style: one question per step). */
export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<string | null>(null);
  const [roleOther, setRoleOther] = useState("");
  const [heard, setHeard] = useState<string | null>(null);
  const [heardOther, setHeardOther] = useState("");
  const [newsletter, setNewsletter] = useState(false);
  const [busy, setBusy] = useState(false);

  const stepValid =
    step === 0 ? !!role && (role !== "other" || roleOther.trim().length > 0)
    : step === 1 ? !!heard && (heard !== "other" || heardOther.trim().length > 0)
    : true;

  const finish = (payload: {
    role: "developer" | "founder" | "enthusiast" | "other";
    roleOther?: string;
    heardFrom: "social" | "friend" | "invite" | "other";
    heardOther?: string;
    newsletter: boolean;
  }) => {
    if (busy) return;
    setBusy(true);
    api.onboarding
      .submit(payload)
      .catch(() => {})
      .finally(() => navigate("/app"));
  };

  const next = () => {
    if (!stepValid) return;
    if (step === 0) setStep(1);
    else if (step === 1) setStep(2);
    else {
      finish({
        role: (role ?? "other") as "developer" | "founder" | "enthusiast" | "other",
        roleOther: role === "other" ? roleOther.trim() : undefined,
        heardFrom: (heard ?? "other") as "social" | "friend" | "invite" | "other",
        heardOther: heard === "other" ? heardOther.trim() : undefined,
        newsletter,
      });
    }
  };

  const skip = () =>
    finish({ role: "other", roleOther: "skipped", heardFrom: "other", heardOther: "skipped", newsletter: false });

  return (
    <div className="flex min-h-screen flex-col bg-[#F7F9F7] px-5 py-8 font-sans text-[#1a1a1a] antialiased">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#171717]">
              <LogoMark className="h-5 w-auto" />
            </span>
            <span className="text-[16px] font-extrabold tracking-tight">Stringz</span>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i <= step ? "w-6 bg-[#3f6b4f]" : "w-3 bg-gray-200"}`} />
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center py-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -32 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {step === 0 && (
                <>
                  <h1 className="text-[24px] font-extrabold tracking-tight">What's your role?</h1>
                  <p className="mt-1.5 text-[13px] text-gray-500">Helps us tailor templates and docs.</p>
                  <div className="mt-6">
                    <Choice
                      options={ROLES}
                      value={role}
                      onPick={setRole}
                      otherValue={roleOther}
                      onOtherChange={setRoleOther}
                      otherPlaceholder="Type your role (30 chars max)"
                    />
                  </div>
                </>
              )}
              {step === 1 && (
                <>
                  <h1 className="text-[24px] font-extrabold tracking-tight">How did you hear about Stringz?</h1>
                  <p className="mt-1.5 text-[13px] text-gray-500">So we know what's working.</p>
                  <div className="mt-6">
                    <Choice
                      options={HEARD}
                      value={heard}
                      onPick={setHeard}
                      otherValue={heardOther}
                      onOtherChange={setHeardOther}
                      otherPlaceholder="Tell us where (30 chars max)"
                    />
                  </div>
                </>
              )}
              {step === 2 && (
                <>
                  <h1 className="text-[24px] font-extrabold tracking-tight">Stay in the loop?</h1>
                  <p className="mt-1.5 text-[13px] text-gray-500">
                    Occasional product updates, new modules and the newsletter. No spam.
                  </p>
                  <div className="mt-6 space-y-2">
                    {[true, false].map((opt) => {
                      const active = newsletter === opt;
                      return (
                        <button
                          key={String(opt)}
                          onClick={() => setNewsletter(opt)}
                          className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left text-[14.5px] font-semibold transition active:scale-[0.99] ${
                            active ? "border-[#3f6b4f] bg-[#F3F7F4] text-[#1a1a1a]" : "border-gray-100 bg-white text-gray-600"
                          }`}
                        >
                          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${active ? "bg-[#3f6b4f] text-white" : "bg-gray-100 text-gray-400"}`}>
                            <Bell size={14} />
                          </span>
                          {opt ? "Yes, send me updates" : "No thanks"}
                          {active && <Check size={16} strokeWidth={3} className="ml-auto text-[#3f6b4f]" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          onClick={next}
          disabled={!stepValid || busy}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#1a1a1a] py-4 text-[14.5px] font-bold text-white transition active:scale-[0.98] disabled:opacity-40"
        >
          {busy ? "Saving…" : step === 2 ? "Start building" : "Continue"} <ArrowRight size={16} />
        </button>
        <button onClick={skip} className="mt-3 text-center text-[12px] font-medium text-gray-400 transition active:text-gray-600">
          Skip for now
        </button>
      </div>
    </div>
  );
}
