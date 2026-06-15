import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * App-wide assistant state: whether the panel is open, and the "on-screen
 * context" the current page wants the assistant to be grounded in (figures,
 * breakdown, validation errors). Pages publish context with
 * useSetAssistantContext so explanations are about the user's real data.
 */
interface AssistantState {
  open: boolean;
  setOpen: (open: boolean) => void;
  pageContext: unknown;
  setPageContext: (context: unknown) => void;
}

const Ctx = createContext<AssistantState | undefined>(undefined);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pageContext, setPageContext] = useState<unknown>(null);
  return (
    <Ctx.Provider value={{ open, setOpen, pageContext, setPageContext }}>{children}</Ctx.Provider>
  );
}

export function useAssistant(): AssistantState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAssistant must be used within an AssistantProvider');
  return ctx;
}

/** Publish the current page's grounding context to the assistant. */
export function useSetAssistantContext(context: unknown): void {
  const { setPageContext } = useAssistant();
  const key = JSON.stringify(context ?? null);
  useEffect(() => {
    setPageContext(context);
    return () => setPageContext(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
