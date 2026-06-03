/**
 * Phase 4 / T4.2 — <TheoField name="..."> styled tier component.
 *
 * Per plan p4-plugin-forms v1.1 ADR D6 (styled tier + optional `@theokit/ui` peer).
 *
 * Composition (v0.1):
 *   <TheoField name="email">
 *     <FormField.Label>Email</FormField.Label>
 *     <FormField.Control>
 *       <Input {...useTheoFieldRegister()} />
 *     </FormField.Control>
 *     <FormField.Error />
 *   </TheoField>
 *
 * Wiring:
 *   1. useTheoField(name) reads RHF state (value, error, register)
 *   2. <FormField invalid={isInvalid}> from @theokit/ui (lazy peer-dep)
 *   3. Children read register via `useTheoFieldRegister()` exported hook
 *      (no cloneElement magic; consumer pulls the props explicitly)
 *
 * Why explicit hook over cloneElement: keeps the data flow visible; avoids
 * brittle tree-walking when consumers wrap inputs in extra divs. Mirrors
 * Radix's "headless primitives + consumer-controlled rendering" philosophy.
 */
import { createContext, useContext, type ReactNode } from "react";
import { type FieldValues } from "react-hook-form";
import { useTheoField, type UseTheoFieldResult } from "../hooks/useTheoField.js";

// Lazy resolve @theokit/ui FormField (optional peer-dep per D6 / EC-10).
type FormFieldComponent = React.ComponentType<{
  invalid?: boolean;
  children: ReactNode;
}>;

let FormFieldImpl: FormFieldComponent | null = null;
let FormFieldImplFailed = false;

function loadFormField(): FormFieldComponent | null {
  if (FormFieldImpl !== null) return FormFieldImpl;
  if (FormFieldImplFailed) return null;
  try {
    // Synchronous CJS-style require via createRequire would be ideal but ESM
    // forbids it. We use a static dynamic-import marker resolved at first call.
    // For v0.1 we assume @theokit/ui IS installed when TheoField is imported.
    // Consumers without it: use useTheoField() headless hook instead.
    // Bundlers (Vite) resolve this at build time via tree-shaking.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const mod = (globalThis as { require?: (id: string) => unknown }).require?.(
      "@theokit/ui/form-field",
    ) as { FormField: FormFieldComponent } | undefined;
    if (mod === undefined) {
      FormFieldImplFailed = true;
      return null;
    }
    FormFieldImpl = mod.FormField;
    return FormFieldImpl;
  } catch {
    FormFieldImplFailed = true;
    return null;
  }
}

/**
 * Internal Context — supplies the current field's useTheoField result to
 * descendants. Consumer's `<Input {...useTheoFieldRegister()}/>` reads from
 * this Context to get the register props for the current TheoField scope.
 */
const TheoFieldScopeContext = createContext<UseTheoFieldResult | null>(null);

/**
 * Hook for descendants of <TheoField> to pull RHF register props.
 * Spread onto your input: `<input {...useTheoFieldRegister()} />`.
 * Throws when used outside a <TheoField name="..."> wrapper.
 */
export function useTheoFieldRegister(): UseTheoFieldResult["register"] {
  const ctx = useContext(TheoFieldScopeContext);
  if (ctx === null) {
    throw new Error(
      "useTheoFieldRegister() must be called from a descendant of <TheoField>. " +
        "Wrap your input scope with <TheoField name=\"...\"> first.",
    );
  }
  return ctx.register;
}

/**
 * Hook for descendants of <TheoField> to read the field's full state
 * (value, error, isInvalid, setValue). Useful for custom error rendering.
 * Throws when used outside a <TheoField>.
 */
export function useTheoFieldScope(): UseTheoFieldResult {
  const ctx = useContext(TheoFieldScopeContext);
  if (ctx === null) {
    throw new Error(
      "useTheoFieldScope() must be called from a descendant of <TheoField>. " +
        "Wrap your input scope with <TheoField name=\"...\"> first.",
    );
  }
  return ctx;
}

export interface TheoFieldProps {
  /** Dot-notation full path matching the form schema (e.g. "user.address.zip"). */
  name: string;
  /**
   * Children compose `<FormField.Label>`, `<FormField.Control>`,
   * `<FormField.Hint>`, `<FormField.Error>` from `@theokit/ui`.
   * Input inside `<FormField.Control>` should spread `useTheoFieldRegister()`.
   */
  children: ReactNode;
}

export function TheoField<_TInput extends FieldValues = FieldValues>(
  props: TheoFieldProps,
): React.JSX.Element {
  const { name, children } = props;
  const field = useTheoField(name);
  const FormField = loadFormField();
  if (FormField === null) {
    throw new Error(
      "<TheoField> requires @theokit/ui — install with: pnpm add @theokit/ui. " +
        "Or use the headless useTheoField() hook for non-@theokit/ui consumers.",
    );
  }

  return (
    <TheoFieldScopeContext.Provider value={field}>
      <FormField invalid={field.isInvalid}>{children}</FormField>
    </TheoFieldScopeContext.Provider>
  );
}
