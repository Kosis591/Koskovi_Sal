"use client";

import type { ReactNode } from "react";

export type SiteShellMetric = {
  label: ReactNode;
  value: ReactNode;
};

export type SiteShellInfoPanelConfig = {
  items: Array<{
    label: ReactNode;
    value: ReactNode;
  }>;
  sideContent?: ReactNode;
  subtitle?: ReactNode;
  title: ReactNode;
};

export function SiteShellMetrics({
  metrics,
}: {
  metrics: SiteShellMetric[];
}) {
  const gridClassName =
    metrics.length <= 2
      ? "grid w-full grid-cols-2 gap-3 sm:w-auto lg:min-w-0"
      : "grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:min-w-[520px]";

  return (
    <div className={gridClassName}>
      {metrics.map((metric) => (
        <div
          className="min-w-32 rounded-lg border border-white/15 bg-white/10 p-4 shadow-sm backdrop-blur"
          key={`${metric.label}`}
        >
          <p className="text-xs font-semibold uppercase text-[#d7e6ed]">
            {metric.label}
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {metric.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function SiteShellInfoPanel({
  panel,
}: {
  panel: SiteShellInfoPanelConfig;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-white/15 bg-white/10 p-4 text-sm text-[#d7e6ed] lg:grid-cols-[minmax(260px,420px)_1fr] lg:items-stretch">
      <div className="rounded-md border border-white/10 bg-white/10 p-3">
        <p className="font-semibold text-white">{panel.title}</p>
        {panel.subtitle ? (
          <p className="mt-1 text-xs text-[#b9d0dc]">{panel.subtitle}</p>
        ) : null}
        <div className="mt-3 grid gap-2">
          {panel.items.map((item) => (
            <div
              className="flex items-center justify-between gap-4 rounded-md border border-white/10 bg-[#002d48]/40 px-3 py-2"
              key={`${item.label}`}
            >
              <p className="text-xs font-semibold uppercase text-[#b9d0dc]">
                {item.label}
              </p>
              <p className="text-base font-semibold text-white">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div className="min-w-0">
        {panel.sideContent ?? (
          <div className="flex h-full min-h-24 items-center rounded-md border border-white/10 bg-white/10 px-4 py-3 text-sm text-[#d7e6ed]">
            Žádné aktuální upozornění.
          </div>
        )}
      </div>
    </div>
  );
}
