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
        bg: 'bg-red-50 text-[#B91C1C] border-red-200',
        badge: 'bg-red-50 text-[#B91C1C] border-red-200',
        dot: 'bg-[#B91C1C]',
        text: 'text-[#B91C1C]',
        ring: 'ring-red-200',
      };
    case 'high':
      return {
        label: 'High',
        bg: 'bg-amber-50 text-[#B45309] border-amber-200',
        badge: 'bg-amber-50 text-[#B45309] border-amber-200',
        dot: 'bg-[#B45309]',
        text: 'text-[#B45309]',
        ring: 'ring-amber-200',
      };
    case 'medium':
      return {
        label: 'Medium',
        bg: 'bg-amber-50 text-[#B45309] border-amber-200',
        badge: 'bg-amber-50 text-[#B45309] border-amber-200',
        dot: 'bg-[#B45309]',
        text: 'text-[#B45309]',
        ring: 'ring-amber-200',
      };
    case 'low':
      return {
        label: 'Low',
        bg: 'bg-blue-50 text-[#2563EB] border-blue-200',
        badge: 'bg-blue-50 text-[#2563EB] border-blue-200',
        dot: 'bg-[#2563EB]',
        text: 'text-[#2563EB]',
        ring: 'ring-blue-200',
      };
    case 'info':
    default:
      return {
        label: 'Informational',
        bg: 'bg-blue-50 text-[#2563EB] border-blue-200',
        badge: 'bg-blue-50 text-[#2563EB] border-blue-200',
        dot: 'bg-[#2563EB]',
        text: 'text-[#2563EB]',
        ring: 'ring-blue-200',
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
