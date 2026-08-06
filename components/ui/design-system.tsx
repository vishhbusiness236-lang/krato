import { type ReactNode } from 'react';

const baseButtonClass = 'inline-flex items-center justify-center rounded-xl border-2 border-[#0A0A0A] px-4 py-2.5 text-sm font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-60';

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variantClass = {
    primary:
      'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-[4px_4px_0px_0px_#0A0A0A] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#0A0A0A]',
    secondary:
      'bg-[#FAFAF9] text-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#0A0A0A]',
    ghost:
      'border-transparent bg-transparent text-[#404040] shadow-none hover:bg-[#D1FAE5] hover:text-[#0A0A0A]',
  }[variant];

  return (
    <button className={`${baseButtonClass} ${variantClass} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border-2 border-[#0A0A0A] bg-[#FAFAF9] shadow-[4px_4px_0px_0px_#0A0A0A] ${className}`}>
      {children}
    </div>
  );
}

export function BrandMark({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeMap = {
    sm: 32,
    md: 40,
    lg: 48,
  };
  const sizeClass = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  }[size];

  return (
    <svg
      suppressHydrationWarning
      width={sizeMap[size]}
      height={sizeMap[size]}
      viewBox="0 0 512 512"
      className={`${sizeClass} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="kratoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06B6D4" stopOpacity="1" />
          <stop offset="100%" stopColor="#14B8A6" stopOpacity="1" />
        </linearGradient>
      </defs>
      <circle cx="256" cy="256" r="256" fill="url(#kratoGradient)" />
      <image href="/logo.png" x="96" y="96" width="320" height="320" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}

export function Badge({
  children,
  tone = 'mint',
  className = '',
}: {
  children: ReactNode;
  tone?: 'mint' | 'cyan' | 'amber' | 'red';
  className?: string;
}) {
  const toneClass = {
    mint: 'border-[#0A0A0A] bg-[#D1FAE5] text-[#065F46]',
    cyan: 'border-[#0A0A0A] bg-cyan-50 text-cyan-700',
    amber: 'border-[#0A0A0A] bg-amber-50 text-amber-700',
    red: 'border-[#0A0A0A] bg-red-50 text-red-700',
  }[tone];

  return <span className={`inline-flex items-center rounded-full border-2 px-3 py-1 text-xs font-semibold ${toneClass} ${className}`}>{children}</span>;
}

export function BrowserMockup({
  title,
  url,
  children,
  className = '',
}: {
  title: string;
  url: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border-2 border-[#0A0A0A] bg-[#FAFAF9] shadow-[4px_4px_0px_0px_#0A0A0A] ${className}`}>
      <div className="flex items-center gap-2 border-b-2 border-[#0A0A0A] bg-[#F7FAFA] px-4 py-3">
        <div className="flex gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
        </div>
        <div className="ml-3 flex-1 rounded-full border-2 border-[#0A0A0A] bg-white px-3 py-1.5 text-left text-xs font-medium text-[#404040]">
          {url}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
