import { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
}

export function Section({ title, children }: Props) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">{title}</h3>
      {children}
    </div>
  );
}
