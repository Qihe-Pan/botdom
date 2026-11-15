import type { Server } from "node:http";
export class InvalidHttpProbe extends Error {}
export interface ProbeRequest { method: string; path: string; headers?: Record<string, string>; body?: string }
export interface HttpProbeProof {
  requiredHeaders: string[];
  baselineStatus?: number;
  baselineHealthStatus?: number;
  cases: Array<{ header: string; mutation: string; triggered: boolean; completeStatus?: number; incompleteStatus?: number; healthStatus?: number; passed?: boolean }>;
}
export function httpHeaderRejectionProbe(spec: { server: Server; request: ProbeRequest; requiredHeaders: string[]; health: ProbeRequest }, record?: (proof: HttpProbeProof) => void): Promise<HttpProbeProof>;
