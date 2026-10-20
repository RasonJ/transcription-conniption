import { useEffect, useState } from "react";
import {
  validationStore,
  type ValidationState,
} from "@/utils/validation/store";

const INITIAL: ValidationState = validationStore.getState();

/** Subscribe to the unified ValidationStore (SPEC-VALIDATION VAL-1). */
export function useValidationStore(text: string): ValidationState {
  const [state, setState] = useState<ValidationState>(INITIAL);

  useEffect(() => {
    validationStore.updateText(text);
  }, [text]);

  useEffect(() => validationStore.subscribe(setState), []);

  return state;
}
