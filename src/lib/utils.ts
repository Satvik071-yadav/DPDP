import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Severity } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSeverity(severity: Severity) {
  switch (severity) {
    case 'critical':
      return {
        label: 'Critical',
        bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
        badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        dot: 'bg-rose-500 shadow-rose-500/50',
        text: 'text-rose-400',
        ring: 'ring-rose-500/30',
      };
    case 'high':
      return {
        label: 'High',
        bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        dot: 'bg-amber-400 shadow-amber-400/50',
        text: 'text-amber-400',
        ring: 'ring-amber-500/30',
      };
    case 'medium':
      return {
        label: 'Medium',
        bg: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
        badge: 'bg-yellow-500/20 text-yellow-200 border-yellow-500/40',
        dot: 'bg-yellow-400 shadow-yellow-400/50',
        text: 'text-yellow-400',
        ring: 'ring-yellow-500/30',
      };
    case 'low':
      return {
        label: 'Low',
        bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
        badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
        dot: 'bg-cyan-400 shadow-cyan-400/50',
        text: 'text-cyan-400',
        ring: 'ring-cyan-500/30',
      };
    case 'info':
    default:
      return {
        label: 'Informational',
        bg: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
        badge: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
        dot: 'bg-slate-400 shadow-slate-400/50',
        text: 'text-slate-400',
        ring: 'ring-slate-500/30',
      };
  }
}

export function formatDate(dateString: string) {
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return dateString;
  }
}

export function truncateUrl(url: string, maxLength: number = 38) {
  if (url.length <= maxLength) return url;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname + parsed.search;
    if (parsed.hostname.length + path.length <= maxLength) return url;
    return `${parsed.hostname}${path.slice(0, maxLength - parsed.hostname.length - 3)}...`;
  } catch {
    return url.slice(0, maxLength) + '...';
  }
}
