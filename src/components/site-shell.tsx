"use client";

import Image from "next/image";
import type { ReactNode } from "react";

type SiteShellProps = {
  actions?: ReactNode;
  afterHero?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  infoPanel?: {
    items: Array<{
      label: ReactNode;
      value: ReactNode;
    }>;
    subtitle?: ReactNode;
    title: ReactNode;
  };
  maxWidthClassName?: string;
  metrics?: Array<{
    label: ReactNode;
    value: ReactNode;
  }>;
  notice?: ReactNode;
  rightContent?: ReactNode;
  title: ReactNode;
};

export function SiteShell({
  actions,
  afterHero,
  children,
  contentClassName = "px-5 py-6 lg:px-8",
  description,
  eyebrow,
  infoPanel,
  maxWidthClassName = "max-w-[1600px]",
  metrics,
  notice,
  rightContent,
  title,
}: SiteShellProps) {
  const resolvedRightContent =
    rightContent ?? (metrics ? <SiteShellMetrics metrics={metrics} /> : null);

  return (
    <main className="min-h-screen bg-[#f7f3ec] text-[#132935]">
      <section className="relative overflow-hidden border-b border-[#002d48] bg-[#003758] text-white">
        <Image
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 top-1/2 hidden h-auto w-80 -translate-y-1/2 opacity-10 md:block"
          height={62}
          src="/brand/Koskovi_logo_znak_white.svg"
          width={71}
        />
        <div
          className={`relative mx-auto flex ${maxWidthClassName} flex-col gap-8 px-5 py-8 lg:px-8`}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <Image
                  alt="Koskovi"
                  className="h-auto w-52"
                  height={62}
                  priority
                  src="/brand/Koskovi_logo_zaklad_white.svg"
                  width={369}
                />
                {actions ? (
                  <div className="flex shrink-0 flex-wrap justify-end gap-3 lg:hidden">
                    {actions}
                  </div>
                ) : null}
              </div>
              {eyebrow}
              <div>
                <h1 className="text-4xl font-semibold tracking-normal text-white sm:text-5xl">
                  {title}
                </h1>
                {description ? (
                  <p className="mt-3 max-w-2xl text-base leading-7 text-[#d7e6ed]">
                    {description}
                  </p>
                ) : null}
              </div>
            </div>

            {(resolvedRightContent || actions) ? (
              <div className="flex flex-col gap-4 lg:items-end">
                {actions ? (
                  <div className="hidden flex-wrap justify-end gap-3 lg:flex">
                    {actions}
                  </div>
                ) : null}
                {resolvedRightContent}
              </div>
            ) : null}
          </div>
          {infoPanel ? <SiteShellInfoPanel panel={infoPanel} /> : null}
          {notice ? (
            <div className="rounded-lg border border-white/15 bg-white/10 p-4 text-sm text-[#d7e6ed]">
              {notice}
            </div>
          ) : null}
          {afterHero}
        </div>
      </section>

      <section className={`mx-auto ${maxWidthClassName} ${contentClassName}`}>
        {children}
      </section>
    </main>
  );
}

function SiteShellMetrics({
  metrics,
}: {
  metrics: NonNullable<SiteShellProps["metrics"]>;
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:min-w-[520px]">
      {metrics.map((metric) => (
        <div
          className="rounded-lg border border-white/15 bg-white/10 p-4 shadow-sm backdrop-blur"
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

function SiteShellInfoPanel({
  panel,
}: {
  panel: NonNullable<SiteShellProps["infoPanel"]>;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-white/15 bg-white/10 p-4 text-sm text-[#d7e6ed] md:grid-cols-[180px_1fr] md:items-start">
      <div>
        <p className="font-semibold text-white">{panel.title}</p>
        {panel.subtitle ? (
          <p className="mt-1 text-xs text-[#b9d0dc]">{panel.subtitle}</p>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {panel.items.map((item) => (
          <div
            className="rounded-md border border-white/10 bg-white/10 px-3 py-2"
            key={`${item.label}`}
          >
            <p className="text-xs font-semibold uppercase text-[#b9d0dc]">
              {item.label}
            </p>
            <p className="mt-1 text-base font-semibold text-white">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
