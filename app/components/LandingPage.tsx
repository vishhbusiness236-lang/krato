'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, BrandMark, BrowserMockup, Button, Card } from '@/components/ui/design-system';

interface LandingPageProps {
  onGetStarted?: () => void;
}

function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

function FadeUp({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, isVisible } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export default function LandingPage({ onGetStarted }: LandingPageProps) {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 12);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.documentElement.style.scrollBehavior = 'smooth';

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.documentElement.style.scrollBehavior = '';
    };
  }, []);

  function handleGetStarted() {
    if (onGetStarted) {
      onGetStarted();
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('krato_seen_landing', 'true');
    }
    router.push('/login');
  }

  const steps = [
    {
      title: 'Paste your URL',
      description: 'Drop in any live link, no setup or code needed.',
    },
    {
      title: 'Krato scans everything',
      description: 'Buttons, forms, links, console errors, and network failures — checked in seconds.',
    },
    {
      title: 'Get an actionable report',
      description: 'Every issue is ranked by severity and ready to fix or share with your team.',
    },
  ];

  const features = [
    {
      title: 'Broken Link Detection',
      description: 'Finds every dead link and 404 before your users do.',
      icon: '↗',
    },
    {
      title: 'Form Validation',
      description: 'Tests every form for silent failures and bad handlers.',
      icon: '✓',
    },
    {
      title: 'Console Error Tracking',
      description: 'Surfaces JavaScript errors hiding in the background.',
      icon: '⚠',
    },
    {
      title: 'Network Failure Monitoring',
      description: 'Catches failed API calls and timeouts in real time.',
      icon: '⟲',
    },
    {
      title: 'PDF Reports',
      description: 'Export clean, shareable reports in one click.',
      icon: '⬇',
    },
    {
      title: 'Scheduled Scans',
      description: 'Set it once — Krato checks your site automatically, on repeat.',
      icon: '⏰',
    },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-[#0A0A0A]">
      <header className={`sticky top-0 z-40 border-b-2 border-[#0A0A0A] transition-all duration-300 ${scrolled ? 'bg-[#F7FAFA]/95 backdrop-blur' : 'bg-transparent'}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 sm:px-8 lg:px-12">
          <div className="flex items-center gap-3">
            <BrandMark size="md" />
            <div>
              <p className="text-base font-semibold tracking-tight">Krato</p>
              <p className="text-xs text-[#404040]">AI QA Agent</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="#how-it-works" className="rounded-xl border-2 border-[#0A0A0A] bg-[#FAFAF9] px-4 py-2 text-sm font-semibold text-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A] transition-all duration-300 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#0A0A0A]">
              Sign In
            </a>
            <Button type="button" onClick={handleGetStarted}>
              Get Started
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col px-6 pb-16 pt-8 sm:px-8 lg:px-12 lg:pt-12">
        <FadeUp className="rounded-[32px] border-2 border-[#0A0A0A] bg-[#F7FAFA] p-8 shadow-[8px_8px_0px_0px_#0A0A0A] sm:p-10 lg:p-16">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="max-w-2xl space-y-6">
              <Badge tone="mint">AI-powered QA for modern web apps</Badge>
              <div className="space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-[#0A0A0A] sm:text-5xl lg:text-7xl">
                  Ship with confidence. Krato catches what you miss.
                </h1>
                <p className="max-w-xl text-lg leading-8 text-[#404040] sm:text-xl">
                  Paste your URL. Krato scans every button, link, form, and console error — and hands you a report before your users ever see the bug.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" onClick={handleGetStarted} className="group bg-gradient-to-r from-cyan-500 to-emerald-500 text-white">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-white/90 transition duration-300 group-hover:scale-110" />
                  Get Started — It&apos;s Free
                </Button>
                <a href="#how-it-works" className="inline-flex items-center justify-center rounded-xl border-2 border-[#0A0A0A] bg-[#FAFAF9] px-4 py-2.5 text-sm font-semibold text-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A] transition-all duration-300 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#0A0A0A]">
                  See how it works ↓
                </a>
              </div>
            </div>

            <BrowserMockup title="Scan preview" url="yourapp.com" className="bg-[#0A0A0A] p-0">
              <div className="space-y-3 rounded-[20px] border-2 border-[#0A0A0A] bg-[#F7FAFA] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#0A0A0A]">Live scan preview</p>
                    <p className="text-xs text-[#404040]">Scanned 2 minutes ago</p>
                  </div>
                  <Badge tone="mint">3 issues found</Badge>
                </div>
                <div className="space-y-2">
                  <Card className="border-red-400 bg-red-50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-red-700">Broken link on /pricing</p>
                      <Badge tone="red">High</Badge>
                    </div>
                    <p className="mt-1 text-xs text-[#404040]">The CTA returns 404 from the live page.</p>
                  </Card>
                  <Card className="border-amber-400 bg-amber-50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-amber-700">Contact form returns 500</p>
                      <Badge tone="amber">Critical</Badge>
                    </div>
                    <p className="mt-1 text-xs text-[#404040]">Submission flow fails on the first attempt.</p>
                  </Card>
                  <Card className="border-cyan-400 bg-cyan-50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-cyan-700">Console error on page load</p>
                      <Badge tone="cyan">Medium</Badge>
                    </div>
                    <p className="mt-1 text-xs text-[#404040]">A runtime exception appears in the console.</p>
                  </Card>
                </div>
              </div>
            </BrowserMockup>
          </div>
        </FadeUp>

        <section id="how-it-works" className="mt-14">
          <FadeUp className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-700">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#0A0A0A] sm:text-4xl">
              Three simple steps to catch more bugs.
            </h2>
          </FadeUp>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {steps.map((step, index) => (
              <FadeUp key={step.title} className="rounded-[24px] border-2 border-[#0A0A0A] bg-[#FAFAF9] p-6 shadow-[4px_4px_0px_0px_#0A0A0A] transition-all duration-300 hover:-translate-y-1 hover:shadow-[2px_2px_0px_0px_#0A0A0A]" delay={index * 100}>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-cyan-100 text-lg font-semibold text-emerald-700">
                  {index + 1}
                </div>
                <h3 className="mt-5 text-xl font-semibold text-[#0A0A0A]">{step.title}</h3>
                <p className="mt-2 text-sm leading-7 text-[#404040]">{step.description}</p>
              </FadeUp>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <FadeUp className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-700">Features</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#0A0A0A] sm:text-4xl">
              Built for developers who ship fast.
            </h2>
          </FadeUp>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <FadeUp key={feature.title} className="rounded-[24px] border-2 border-[#0A0A0A] bg-[#FAFAF9] p-6 shadow-[4px_4px_0px_0px_#0A0A0A] transition-all duration-300 hover:-translate-y-1 hover:shadow-[2px_2px_0px_0px_#0A0A0A]" delay={index * 75}>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-cyan-100 text-lg text-emerald-700">
                  {feature.icon}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-[#0A0A0A]">{feature.title}</h3>
                <p className="mt-2 text-sm leading-7 text-[#404040]">{feature.description}</p>
              </FadeUp>
            ))}
          </div>
        </section>

        <FadeUp className="mt-16 rounded-[28px] border-2 border-[#0A0A0A] bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-6 py-8 shadow-[4px_4px_0px_0px_#0A0A0A] sm:px-10 lg:px-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-700">Built for early-stage launches</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#0A0A0A] sm:text-3xl">
                Fast scans, clear findings, and no setup overhead.
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border-2 border-[#0A0A0A] bg-[#FAFAF9] px-4 py-3 text-center shadow-[4px_4px_0px_0px_#0A0A0A]">
                <p className="text-2xl font-semibold text-emerald-700">60s</p>
                <p className="mt-1 text-sm text-[#404040]">Average scan time</p>
              </div>
              <div className="rounded-2xl border-2 border-[#0A0A0A] bg-[#FAFAF9] px-4 py-3 text-center shadow-[4px_4px_0px_0px_#0A0A0A]">
                <p className="text-2xl font-semibold text-cyan-700">5</p>
                <p className="mt-1 text-sm text-[#404040]">Issue types caught</p>
              </div>
              <div className="rounded-2xl border-2 border-[#0A0A0A] bg-[#FAFAF9] px-4 py-3 text-center shadow-[4px_4px_0px_0px_#0A0A0A]">
                <p className="text-2xl font-semibold text-cyan-700">100%</p>
                <p className="mt-1 text-sm text-[#404040]">Built for solo devs</p>
              </div>
            </div>
          </div>
        </FadeUp>

        <FadeUp className="mt-16 rounded-[32px] border-2 border-[#0A0A0A] bg-gradient-to-br from-cyan-500 via-cyan-500 to-emerald-500 px-8 py-12 text-center text-white shadow-[8px_8px_0px_0px_#0A0A0A] sm:px-10 lg:px-16">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Stop finding bugs after your users do.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-cyan-50">
            Bring QA into your release loop with a polished, always-on agent that spots issues before they turn into customer-facing problems.
          </p>
          <Button type="button" onClick={handleGetStarted} className="mt-8 bg-white text-emerald-700 shadow-[4px_4px_0px_0px_#0A0A0A] hover:shadow-[2px_2px_0px_0px_#0A0A0A]">
            Get Started Free
          </Button>
        </FadeUp>
      </main>

      <footer className="border-t-2 border-[#0A0A0A] bg-[#F7FAFA]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 text-sm text-[#404040] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <div className="flex items-center gap-3">
            <BrandMark size="sm" />
            <div>
              <p className="font-semibold text-[#0A0A0A]">Krato</p>
              <p className="text-xs text-[#404040]">Built for developers who ship fast.</p>
            </div>
          </div>
          <div className="flex gap-5">
            <a href="#" className="transition hover:text-cyan-700">Docs</a>
            <a href="#" className="transition hover:text-cyan-700">Blog</a>
            <a href="#" className="transition hover:text-cyan-700">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
