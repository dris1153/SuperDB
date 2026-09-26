/**
 * Mirrors the Supabase dashboard sign-in page, which offers GitHub, ChatGPT, SSO and email+password.
 * There is deliberately no Google option — it does not exist there.
 *
 * Which passwords are worth storing follows from the method: a social sign-in needs no password here
 * (that account is managed wherever you manage it), email+password needs both the Supabase password
 * and the one for the mailbox behind it, and SSO needs only the identity provider's.
 *
 * A plain module rather than part of vault-actions.ts: "use server" files may only export async
 * functions, and both the credentials form and the connections table need these labels.
 */

export type Method = "email" | "github" | "chatgpt" | "sso";

export const METHODS: {
  value: Method;
  label: string;
  supabasePassword: boolean;
  emailPassword: boolean;
}[] = [
  { value: "email", label: "Email + password", supabasePassword: true, emailPassword: true },
  { value: "github", label: "GitHub", supabasePassword: false, emailPassword: false },
  { value: "chatgpt", label: "ChatGPT", supabasePassword: false, emailPassword: false },
  { value: "sso", label: "SSO", supabasePassword: false, emailPassword: true },
];

export const METHOD_VALUES = METHODS.map((m) => m.value);

export const methodLabel = (value: Method | null | undefined) =>
  METHODS.find((m) => m.value === value)?.label ?? null;
