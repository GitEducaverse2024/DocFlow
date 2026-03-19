"use client";

import { ReactNode } from 'react';
import { Breadcrumb } from './breadcrumb';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ title, description, icon, action }: PageHeaderProps) {
  return (
    <div className="mb-6">
      <Breadcrumb />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon && <div className="text-violet-400">{icon}</div>}
          <div>
            <h1 className="text-2xl font-bold text-zinc-50">{title}</h1>
            {description && <p className="text-sm text-zinc-400 mt-0.5">{description}</p>}
          </div>
        </div>
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}
