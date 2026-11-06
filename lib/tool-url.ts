// The Prompt Chain Tool (kaffy811/HumorProject-PromptChains), a separate app where
// chains and their steps are designed. PROMPT_CHAIN_TOOL_URL overrides the
// production address, e.g. for a preview deployment.
const DEFAULT_URL = "https://humor-project-prompt-chains-rho.vercel.app";
export function promptChainToolUrl(path = "") {
  const base = process.env.PROMPT_CHAIN_TOOL_URL?.startsWith("https://") ? process.env.PROMPT_CHAIN_TOOL_URL : DEFAULT_URL;
  return `${base.replace(/\/$/, "")}${path}`;
}
