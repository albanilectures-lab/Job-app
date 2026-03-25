import OpenAI from "openai";
import type { ScreeningQuestion, UserProfile } from "./types";
import { v4 as uuid } from "uuid";

const openai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

/** Common screening question templates seeded from the user profile */
export function generateDefaultScreeningAnswers(profile: UserProfile): ScreeningQuestion[] {
  const questions: ScreeningQuestion[] = [];
  const add = (q: string, a: string, cat: ScreeningQuestion["category"]) =>
    questions.push({ id: uuid(), question: q, answer: a, category: cat });

  // Experience
  add(
    "How many years of professional experience do you have?",
    `I have ${profile.yearsExperience} years of professional experience.`,
    "experience"
  );

  if (profile.currentTitle) {
    add("What is your current job title?", profile.currentTitle, "experience");
  }

  if (profile.skills.length > 0) {
    add(
      "What are your key technical skills?",
      profile.skills.join(", "),
      "technical"
    );
  }

  if (profile.experienceSummary) {
    add(
      "Describe your relevant experience.",
      profile.experienceSummary,
      "experience"
    );
  }

  // Availability
  const availMap: Record<string, string> = {
    immediately: "I am available to start immediately.",
    "1week": "I can start within one week.",
    "2weeks": "I can start within two weeks (standard notice period).",
    "1month": "I can start within one month.",
    "2months": "I require a two month notice period.",
  };
  add(
    "When are you available to start?",
    availMap[profile.availability ?? "immediately"] ?? "I am available to start immediately.",
    "availability"
  );

  add(
    "Are you willing to work remotely?",
    "Yes, I am experienced working remotely and have a dedicated home office setup.",
    "availability"
  );

  // Salary
  if (profile.expectedSalary) {
    add(
      "What are your salary expectations?",
      `My expected annual salary is $${profile.expectedSalary.toLocaleString()}.`,
      "salary"
    );
  }

  if (profile.expectedHourlyRate) {
    add(
      "What is your expected hourly rate?",
      `My expected hourly rate is $${profile.expectedHourlyRate}/hr.`,
      "salary"
    );
  }

  // Legal / Work Authorization
  if (profile.workAuthCountries && profile.workAuthCountries.length > 0) {
    add(
      "Are you legally authorized to work in this country?",
      `Yes, I am authorized to work in: ${profile.workAuthCountries.join(", ")}.`,
      "legal"
    );
  }

  add(
    "Do you require visa sponsorship?",
    profile.visaSponsorship ? "Yes, I would require visa sponsorship." : "No, I do not require visa sponsorship.",
    "legal"
  );

  // General
  add(
    "Why are you interested in this position?",
    `I am passionate about leveraging my ${profile.yearsExperience} years of experience in ${profile.skills.slice(0, 3).join(", ")} to contribute to a team where I can make a meaningful impact while continuing to grow professionally.`,
    "general"
  );

  add(
    "Are you willing to undergo a background check?",
    "Yes, I am willing to undergo a background check.",
    "general"
  );

  return questions;
}

/**
 * Use AI to generate answers for custom screening questions based on the user's profile.
 */
export async function aiAnswerScreeningQuestions(
  questions: string[],
  profile: UserProfile
): Promise<{ question: string; answer: string }[]> {
  const prompt = `You are filling out job application screening questions on behalf of a candidate. Answer each question professionally, concisely, and honestly based on the candidate's profile.

## Candidate Profile
Name: ${profile.fullName}
Title: ${profile.currentTitle ?? "Software Engineer"}
Years of Experience: ${profile.yearsExperience}
Skills: ${profile.skills.join(", ")}
Location: ${[profile.city, profile.state, profile.country].filter(Boolean).join(", ") || "Not specified"}
Availability: ${profile.availability ?? "immediately"}
Visa Sponsorship Needed: ${profile.visaSponsorship ? "Yes" : "No"}
${profile.expectedSalary ? `Expected Salary: $${profile.expectedSalary}` : ""}
${profile.experienceSummary ? `Experience Summary: ${profile.experienceSummary}` : ""}

## Questions to Answer
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

## Instructions
- Be professional and concise (1-3 sentences per answer)
- Be honest — don't fabricate experience not in the profile
- For salary questions, give a range if a specific number isn't available
- For yes/no questions, answer directly then briefly explain

Respond in valid JSON only:
[
  { "question": "<original question>", "answer": "<your answer>" }
]`;

  try {
    const response = await openai.chat.completions.create({
      model: "grok-3-mini-fast",
      messages: [
        { role: "system", content: "You are a job application assistant. Always respond with valid JSON array." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("AI screening answer failed:", error);
    return questions.map((q) => ({ question: q, answer: "Please provide your answer." }));
  }
}
