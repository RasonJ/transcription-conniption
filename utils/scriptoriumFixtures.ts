/**
 * GENERATED: 2026-10-19T15:50:54.101Z — run `npm run compile-fixtures` (idempotent stamp)
 * Offline / demo fixture loader for the HSMS scriptorium workstation.
 * Prefer assets/scriptorium-offline.json when present (merged + compiled).
 */
import staticBundle from "../assets/scriptorium-static-bundle.json";

export type ScriptoriumFixture = {
  scene?: string;
  mcp_tool?: string;
  response_markdown?: string;
  response?: Record<string, unknown>;
  variants?: string[];
};

export type ScriptoriumFixtureBundle = {
  version?: string;
  domain?: string;
  fixtures: Record<string, ScriptoriumFixture>;
  built_at?: string;
};

const bundle = staticBundle as ScriptoriumFixtureBundle;

export function listScriptoriumFixtures(): string[] {
  return Object.keys(bundle.fixtures ?? {});
}

export function getScriptoriumFixture(id: string): ScriptoriumFixture | undefined {
  return bundle.fixtures?.[id];
}

export function scriptoriumFixtureCount(): number {
  return Object.keys(bundle.fixtures ?? {}).length;
}
