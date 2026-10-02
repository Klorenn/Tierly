import type { ReactNode } from "react";

export interface GateProps {
  readonly title: string;
  readonly children: ReactNode;
}

/** Pantalla de bloqueo: sin sesión, sin autorización o sin comunidad. */
export function Gate({ title, children }: GateProps) {
  return (
    <div className="tla">
      <div className="tla-gate">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
