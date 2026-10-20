/**
 * Unified validation pipeline (SPEC-VALIDATION VAL-1…VAL-3).
 * Lexical lint @ 150 ms; structural compile diagnostics @ 400 ms; neither gated on blur.
 */
import type { ValidationError } from "@/constants/manuscript";
import { compileManuscriptTree } from "@/utils/compiler";
import { lintHsmsTranscription } from "@/utils/hsmsLinter";

export interface ValidationState {
  revision: number;
  isParsing: boolean;
  diagnostics: ValidationError[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

type Listener = (state: ValidationState) => void;

const LEXICAL_MS = 150;
const STRUCTURAL_MS = 400;

function issueKey(issue: ValidationError): string {
  return `${issue.lineIndex}|${issue.severity}|${issue.code ?? ""}|${issue.message}`;
}

function mergeUnique(issues: ValidationError[]): ValidationError[] {
  const uniqueMap = new Map<string, ValidationError>();
  for (const issue of issues) {
    const key = issueKey(issue);
    if (!uniqueMap.has(key)) uniqueMap.set(key, issue);
  }
  return Array.from(uniqueMap.values());
}

class ValidationStoreManager {
  private revision = 0;
  private currentText = "";
  private lexicalIssues: ValidationError[] = [];
  private structuralIssues: ValidationError[] = [];
  private state: ValidationState = {
    revision: 0,
    isParsing: false,
    diagnostics: [],
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
  };
  private listeners = new Set<Listener>();
  private lexicalTimer: ReturnType<typeof setTimeout> | null = null;
  private structuralTimer: ReturnType<typeof setTimeout> | null = null;

  public getState(): ValidationState {
    return this.state;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public updateText(newText: string): void {
    if (newText === this.currentText) return;

    this.currentText = newText;
    this.revision += 1;
    const rev = this.revision;
    this.setState({ isParsing: true });

    if (this.lexicalTimer) clearTimeout(this.lexicalTimer);
    this.lexicalTimer = setTimeout(() => {
      if (rev !== this.revision) return;
      const lintReport = lintHsmsTranscription(this.currentText);
      this.lexicalIssues = lintReport.issues;
      this.publishMerged(rev, false);
    }, LEXICAL_MS);

    if (this.structuralTimer) clearTimeout(this.structuralTimer);
    this.structuralTimer = setTimeout(() => {
      if (rev !== this.revision) return;
      try {
        const parsed = compileManuscriptTree(this.currentText);
        this.structuralIssues = parsed.validationErrors ?? [];
        this.publishMerged(rev, true);
      } catch {
        this.publishMerged(rev, true);
      }
    }, STRUCTURAL_MS);
  }

  private publishMerged(rev: number, structuralDone: boolean): void {
    if (rev !== this.revision) return;
    const merged = mergeUnique([...this.lexicalIssues, ...this.structuralIssues]);
    const errorCount = merged.filter((i) => i.severity === "error").length;
    const warningCount = merged.filter((i) => i.severity === "warning").length;
    const infoCount = merged.filter((i) => i.severity === "info").length;
    this.setState({
      diagnostics: merged,
      errorCount,
      warningCount,
      infoCount,
      isParsing: !structuralDone,
    });
  }

  private setState(patch: Partial<ValidationState>): void {
    this.state = { ...this.state, ...patch, revision: this.revision };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export const validationStore = new ValidationStoreManager();
