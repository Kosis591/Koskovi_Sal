"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import {
  SiteShellInfoPanel,
  SiteShellMetrics,
  type SiteShellInfoPanelConfig,
  type SiteShellMetric,
} from "@/components/site-shell-panels";

type SiteShellProps = {
  actions?: ReactNode;
  afterHero?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  infoPanel?: SiteShellInfoPanelConfig;
  maxWidthClassName?: string;
  metrics?: SiteShellMetric[];
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
          className={`relative mx-auto flex ${maxWidthClassName} flex-col gap-5 px-5 py-5 lg:px-6`}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <Image
                  alt="Koškovi"
                  className="h-auto w-44"
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
                <h1 className="text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                  {title}
                </h1>
                {description ? (
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d7e6ed]">
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
