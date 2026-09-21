import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import LogoMark from "../components/LogoMark";

/**
 * Privacy policy and terms of service (PRD §7 Phase 2a legal minimum).
 * Copy matches the current product reality (§1.1): localStorage-only forms,
 * no accounts, no custody, no financial services. Update as the Phase 2b
 * backend lands.
 */

const SECTIONS: Record<"privacy" | "terms", { title: string; updated: string; body: [string, string[]][] }> = {
  privacy: {
    title: "Privacy Policy",
    updated: "Last updated: September 19, 2026",
    body: [
      [
        "What Stringz is",
        [
          "Stringz is a visual builder for on-chain and app automations. It is tooling only: Stringz never holds your keys, funds, or signatures, and never asks for a private key or seed phrase.",
        ],
      ],
      [
        "What we store",
        [
          "If you self-host Stringz, the backend stores data on the server you run. Accounts: your email address (password stored only as a hash), wallet address, and/or the identifier your OAuth provider shares. Saved scenarios: the nodes and connections of flows you save. Waitlist and newsletter: your email address.",
          "A signed-in session is remembered with an httpOnly cookie (30 days). Generated CRE projects and their secrets are never sent to us - they run under your own Chainlink CRE account.",
        ],
      ],
      [
        "What we do not do",
        [
          "We do not collect private keys or seed phrases, we do not track on-chain activity, and we never sell or share personal information. We do not run advertising or third-party analytics.",
        ],
      ],
      [
        "Retention and deletion",
        [
          "We keep your data while your account is active. Email hello@stringz.io from the address on file to export or delete your account and its saved flows. Waitlist/newsletter addresses are removed on request.",
        ],
      ],
      [
        "Contact",
        [
          "Questions: hello@stringz.io.",
        ],
      ],
    ],
  },
  terms: {
    title: "Terms of Service",
    updated: "Last updated: September 19, 2026",
    body: [
      [
        "The service",
        [
          "Stringz provides automation building tools. Generated projects (blueprints and Chainlink CRE workflows) are code artifacts that you run and deploy under your own accounts, keys, funds, and secrets. Accounts, saved scenarios, and waitlist/newsletter emails are stored on the backend you connect to - self-hosted by default.",
        ],
      ],
      [
        "Tooling only - no custody",
        [
          "Stringz is tooling only, like n8n or Zapier. Stringz never takes custody of digital assets, never executes transactions with its own keys, and provides no financial, investment, legal, or tax advice. Any automation you build is your own responsibility to review before running.",
        ],
      ],
      [
        "Your responsibilities",
        [
          "You are responsible for the workflows you create, deploy, and operate; for securing your own keys, secrets, and API tokens; and for complying with the laws and terms of service that apply to you, including the terms of Chainlink CRE and any app you connect (Slack, Discord, OpenAI, and others).",
          "Do not use Stringz to violate laws, sanctions, or third-party rights. We may restrict access for abuse.",
        ],
      ],
      [
        "Service provided as-is",
        [
          "The service is provided \"as is\" without warranties of any kind. On-chain execution involves risk, including loss of funds; you assume that risk entirely. To the maximum extent permitted by law, Stringz's liability is limited to the amount you have paid us in the past 12 months (zero for the free tier).",
        ],
      ],
      [
        "General",
        [
          "You must be at least 18 years old to use Stringz. These terms may be updated as the product evolves; material changes will be noted on this page. Questions: hello@stringz.io.",
        ],
      ],
    ],
  },
};

export default function Legal({ doc }: { doc: "privacy" | "terms" }) {
  const page = SECTIONS[doc];
  return (
    <div className="min-h-[100dvh] bg-[#F7F9F7] text-[#1a1a1a]" style={{ fontFamily: '"Lexend Deca", -apple-system, sans-serif' }}>
      <div className="mx-auto max-w-2xl px-6 pb-24 pt-8">
        <div className="mb-10 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <LogoMark className="h-6 w-4" />
            <span className="text-[15px] font-extrabold tracking-tight">Stringz</span>
          </Link>
          <Link to="/" className="flex items-center gap-1 text-[12.5px] font-semibold text-gray-500 hover:text-[#1a1a1a]">
            <ArrowLeft size={14} /> Back
          </Link>
        </div>
        <h1 className="text-[28px] font-extrabold tracking-tight">{page.title}</h1>
        <p className="mt-1 text-[12px] text-gray-400">{page.updated}</p>
        <div className="mt-8 space-y-8">
          {page.body.map(([heading, paragraphs]) => (
            <section key={heading}>
              <h2 className="text-[16px] font-bold">{heading}</h2>
              {paragraphs.map((p, i) => (
                <p key={i} className="mt-2 text-[13.5px] leading-relaxed text-gray-600">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
        <p className="mt-12 border-t border-gray-200 pt-6 text-[11.5px] text-gray-400">
          Stringz is tooling only — never custody.
        </p>
      </div>
    </div>
  );
}
