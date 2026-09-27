import { toBlueprint, serializeBlueprint, BlueprintError } from "./schema";
import { generateCreProject, blueprintSecrets, type CompileTarget } from "./cre";
import type { FlowNode, FlowEdge } from "../data/services";

export { BlueprintError };
export type { Blueprint } from "./schema";
export type { CompileTarget } from "./cre";

export interface CompileResult {
  blueprintJson: string;
  creFiles: Record<string, string>;
  web3Modules: number;
  web2Modules: number;
  /** Env-var secret names this flow reads at run time (cloud-run pre-flight). */
  requiredSecrets: string[];
  /** The target this compile produced (cloud runs use "cloud-sim"). */
  target: CompileTarget;
}

/**
 * Canvas graph → blueprint JSON + Chainlink CRE project files. Throws BlueprintError.
 * target "export" (default) gates hosted-only services; "cloud-sim" emits real
 * API calls for them authorized by run-scoped ephemeral secrets.
 */
export function compileFlow(name: string, nodes: FlowNode[], edges: FlowEdge[], opts: { target?: CompileTarget } = {}): CompileResult {
  const target = opts.target ?? "export";
  const blueprint = toBlueprint(name, nodes, edges);
  const web3Modules = blueprint.nodes.filter((n) =>
    ["price-feed", "evm-event", "contract-call", "token-transfer", "swap", "ccip"].includes(n.module)
  ).length;
  return {
    blueprintJson: serializeBlueprint(blueprint),
    creFiles: generateCreProject(blueprint, { target }),
    web3Modules,
    web2Modules: blueprint.nodes.length - web3Modules,
    requiredSecrets: blueprintSecrets(blueprint),
    target,
  };
}
