// Two-stage classifier: keywords first (free), Gemini only for ambiguous long messages

const KEYWORDS: Record<string, string[]> = {
  complaint: ["shikoyat","yomon","ishlamayapti","muammo","jang","qoniqarsiz","kechikti","javob bermayapti","aldandi","buzilgan","noto'g'ri","noto`g`ri"],
  offer:     ["taklif","fikrim bor","yaxshilash","qo'shing","qo`shing","kerak bo'ladi","g'oya","g`oya","tavsiya qilaman"],
  lead:      ["narx","narxi qancha","qancha turadi","sotib olaman","sotib olmoqchiman","buyurtma","qanday olaman","menejer bilan","aloqa qilmoqchiman"],
};

export interface ClassifyResult {
  kind: "complaint" | "offer" | "lead" | "question";
  score: number;
  summary: string;
}

export async function classifyMessage(text: string): Promise<ClassifyResult | null> {
  const lower = text.toLowerCase();
  for (const [kind, kws] of Object.entries(KEYWORDS)) {
    if (kws.some((kw) => lower.includes(kw))) {
      return { kind: kind as ClassifyResult["kind"], score: 0.7, summary: text.slice(0, 80) };
    }
  }
  // Only call Gemini for longer unclassified messages (avoid cost on short greetings)
  if (text.trim().split(/\s+/).length < 15) return null;
  try {
    const apiKey = process.env.GEMINI_API_KEY ?? "";
    const prompt = `Classify this Uzbek message into exactly one category: complaint, offer, lead, or question.
Respond with JSON only: {"kind":"complaint"|"offer"|"lead"|"question","score":0.0-1.0,"summary":"max 12 words in Uzbek"}
Message: "${text.slice(0, 500)}"`;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const cleaned = raw.trim().replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.kind === "question") return null; // don't create inbox items for regular questions
    return parsed as ClassifyResult;
  } catch {
    return null;
  }
}
