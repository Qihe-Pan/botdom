export class InvalidMutationProbe extends Error {}
export interface MutationProbeCase {
  index: number;
  mode: "baseline" | "before-effect" | "after-effect";
  triggered: boolean;
  mutations: string[];
  acknowledged?: boolean;
  errorCode?: string;
  expected?: unknown;
  beforeRecovery?: unknown;
  afterRecovery?: unknown;
  passed?: boolean;
}
export interface MutationProbeProof { baselineMutations: string[]; cases: MutationProbeCase[] }
export function mutationRecoveryProbe(args: {
  scratch: string;
  prepare(args: { directory: string }): Promise<{
    mutate(): Promise<unknown>;
    observe(): Promise<unknown>;
    recover(): Promise<unknown>;
    dispose(): Promise<unknown>;
  }>;
}, record?: (proof: MutationProbeProof) => void): Promise<MutationProbeProof>;
