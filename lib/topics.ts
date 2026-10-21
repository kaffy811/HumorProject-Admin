// Keyword topics for a Columbia / NYC humor site. Transparent on purpose: each
// post shows the words that placed it, and the first matching topic wins.
export const TOPICS = [
  {
    key: "columbia", label: "Columbia", hint: "Campus places, courses and traditions",
    words: ["columbia", "barnard", "butler", "low steps", "low library", "lerner", "john jay", "jjs", "ferris", "hewitt", "dodge", "mudd", "pupin", "uris", "carman", "wien", "furnald", "lion", "roar-ee", "the core", "core curriculum", "lit hum", "contemporary civilization", "frontiers of science", "art hum", "music hum", "sundial", "morningside", "seas", "college walk", "ivy"],
  },
  {
    key: "nyc", label: "New York City", hint: "The city outside the gates",
    words: ["new york", "nyc", "manhattan", "brooklyn", "queens", "bronx", "harlem", "subway", "1 train", "mta", "metrocard", "omny", "bodega", "central park", "times square", "broadway", "halal cart", "dollar slice", "pizza rat", "rent", "landlord", "uber", "citi bike", "rat", "pigeon", "the city"],
  },
  {
    key: "student", label: "Student life", hint: "Any campus, not specifically Columbia",
    words: ["midterm", "final", "exam", "quiz", "recitation", "problem set", "pset", "homework", "lecture", "professor", "office hours", "gpa", "internship", "recruiting", "career fair", "dining hall", "dorm", "roommate", "freshman", "sophomore", "senior", "group project", "syllabus", "study", "library", "class", "semester", "8am", "8:00 am", "option c", "deadline", "essay"],
  },
] as const;
export type TopicKey = (typeof TOPICS)[number]["key"] | "other";

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PATTERNS = TOPICS.map((t) => ({ ...t, patterns: t.words.map((w) => ({ word: w, re: new RegExp(`(^|[^a-z0-9])${escape(w)}(s|es)?($|[^a-z0-9])`, "i") })) }));

export function classify(...texts: (string | null | undefined)[]): { topic: TopicKey; matches: string[] } {
  const text = texts.filter(Boolean).join(" \n ");
  for (const t of PATTERNS) {
    const matches = t.patterns.filter((p) => p.re.test(text)).map((p) => p.word);
    if (matches.length) return { topic: t.key, matches };
  }
  return { topic: "other", matches: [] };
}
export const topicLabel = (key: string) => TOPICS.find((t) => t.key === key)?.label ?? "Other";
