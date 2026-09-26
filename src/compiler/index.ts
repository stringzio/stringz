import { toBlueprint, serializeBlueprint, BlueprintError } from "./schema";
import { generateCreProject, blueprintSecrets } from "./cre";
import type { FlowNode, FlowEdge } from "../data/services";

export { BlueprintError };
export type { Blueprint } from "./schema";

export interface CompileResult {
  blueprintJson: string;
  creFiles: Record<string, string>;
  web3Modules: number;
  web2Modules: number;
  /** Env-var secret names this flow reads at run time (cloud-run pre-flight). */
  requiredSecrets: string[];
}

/** Canvas graph → blueprint JSON + Chainlink CRE project files. Throws BlueprintError. */
export function compileFlow(name: string, nodes: FlowNode[], edges: FlowEdge[]): CompileResult {
  const blueprint = toBlueprint(name, nodes, edges);
  const web3Modules = blueprint.nodes.filter((n) =>
    ["price-feed", "evm-event", "contract-call", "token-transfer", "swap", "ccip"].includes(n.module)
  ).length;
  return {
    blueprintJson: serializeBlueprint(blueprint),
    creFiles: generateCreProject(blueprint),
    web3Modules,
    web2Modules: blueprint.nodes.length - web3Modules,
    requiredSecrets: blueprintSecrets(blueprint),
  };
}
