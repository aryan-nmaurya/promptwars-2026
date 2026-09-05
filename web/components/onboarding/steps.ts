/** Static choices offered by the onboarding steps. */

export const PRESET_INTERESTS = [
  "Healthcare & wellbeing",
  "Mental health",
  "Accessibility",
  "Climate & sustainability",
  "Education & learning",
  "Agriculture & food",
  "Finance & fintech",
  "Public transport & mobility",
  "Civic tech & governance",
  "Security & privacy",
  "Developer tools",
  "E-commerce & retail",
  "Sports & fitness",
  "Music & audio",
  "Gaming",
  "Social impact & NGOs",
  "Logistics & supply chain",
  "Disaster response",
  "Legal tech",
  "Space & astronomy",
] as const;

export const SKILL_CATEGORIES = [
  {
    category: "Languages",
    skills: [
      "Python",
      "JavaScript",
      "TypeScript",
      "Java",
      "C++",
      "C#",
      "Go",
      "Rust",
      "Kotlin",
      "Swift",
      "PHP",
      "R",
      "Dart",
    ],
  },
  {
    category: "Frontend",
    skills: [
      "React",
      "Next.js",
      "Vue",
      "Angular",
      "Tailwind CSS",
      "HTML & CSS",
      "Flutter",
      "React Native",
    ],
  },
  {
    category: "Backend",
    skills: ["Node.js / Express", "FastAPI", "Django", "Flask", "Spring Boot", ".NET", "Laravel"],
  },
  {
    category: "Data & AI",
    skills: [
      "Pandas",
      "NumPy",
      "scikit-learn",
      "PyTorch",
      "TensorFlow",
      "OpenCV",
      "LangChain",
      "Hugging Face",
    ],
  },
  {
    category: "Databases",
    skills: ["PostgreSQL", "MySQL", "MongoDB", "SQLite", "Redis", "Firebase", "Supabase"],
  },
  {
    category: "Infra & tools",
    skills: ["Docker", "Git & GitHub", "AWS", "GCP", "Azure", "Vercel", "Kubernetes", "CI/CD", "Linux"],
  },
] as const;

/** At most this many free-text additions per step, on top of the presets. */
export const MAX_CUSTOM_TAGS = 5;

export const LIMIT_REACHED =
  "That's as much as the generator reads — deselect one to add another.";
