import { SectionTabs } from "@/components/SectionTabs";
const TABS = [
  { href: "/ai", label: "Overview" },
  { href: "/ai/runs", label: "Generation requests" },
  { href: "/ai/responses", label: "LLM responses" },
  { href: "/ai/prompt-chains", label: "Prompt chains" },
  { href: "/ai/llm-models", label: "LLM models & providers" },
  { href: "/ai/terms", label: "Terms" },
  { href: "/ai/examples", label: "Generation examples" },
  { href: "/ai/test-run", label: "Test run" },
];
export default function AiLayout({ children }: { children: React.ReactNode }) {
  return <><SectionTabs label="AI models & prompts" tabs={TABS} />{children}</>;
}
