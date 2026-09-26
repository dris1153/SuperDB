"use client";

import {
  IconBrandApple,
  IconBrandDiscord,
  IconBrandFacebook,
  IconBrandGithub,
  IconBrandGoogle,
  IconBrandLinkedin,
  IconBrandSlack,
  IconBrandTwitch,
  IconBrandTwitter,
  IconBrandWindows,
  IconKey,
  IconMail,
  IconPhone,
  IconUser,
} from "@tabler/icons-react";
import { providerName } from "@/lib/auth-users";

/**
 * A provider as the original shows it: its mark, then its name spelled the way it spells itself.
 *
 * A provider with no icon here renders its name alone rather than a placeholder box — Supabase adds
 * providers faster than this map will be updated, and an unfamiliar one is still perfectly readable
 * as a word.
 */
const ICONS: Record<string, typeof IconBrandGithub> = {
  github: IconBrandGithub,
  google: IconBrandGoogle,
  apple: IconBrandApple,
  facebook: IconBrandFacebook,
  discord: IconBrandDiscord,
  slack: IconBrandSlack,
  slack_oidc: IconBrandSlack,
  twitch: IconBrandTwitch,
  twitter: IconBrandTwitter,
  linkedin: IconBrandLinkedin,
  linkedin_oidc: IconBrandLinkedin,
  azure: IconBrandWindows,
  email: IconMail,
  phone: IconPhone,
  anonymous: IconUser,
};

export function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  const Icon = ICONS[provider] ?? (provider.startsWith("sso") ? IconKey : null);
  return Icon ? <Icon className={className ?? "size-4"} aria-hidden /> : null;
}

/** The pair, for a table cell or a card heading. */
export function Provider({ provider }: { provider: string }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <ProviderIcon provider={provider} />
      {providerName(provider)}
    </span>
  );
}
