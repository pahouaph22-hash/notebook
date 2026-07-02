// =====================================================================
// Supabase Edge Function: summarize
// สรุปเนื้อหาโน้ตด้วย Claude API (เก็บ API key ไว้ฝั่ง server อย่างปลอดภัย)
//
// Deploy:
//   1) เก็บคีย์:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxx
//   2) deploy :  supabase functions deploy summarize --no-verify-jwt
//      (หรือสร้างผ่าน Dashboard > Edge Functions แล้ววางโค้ดนี้)
// =====================================================================

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { title = "", content = "", lang = "th" } = await req.json();

    if (!content || content.trim().length < 15) {
      return json({ error: "เนื้อหาน้อยเกินไป ยังสรุปไม่ได้" }, 400);
    }

    const langName = lang === "lo" ? "Lao" : lang === "en" ? "English" : "Thai";

    const prompt =
`You are a study assistant for a student. Summarize the lecture note below.

Write the ENTIRE response in ${langName}. Use clean Markdown with these sections:
1. A "## ประเด็นสำคัญ" style heading (translate the heading into ${langName}) followed by 3–6 concise bullet points capturing the key ideas.
2. A short "สรุปย่อ" (translate) — 2–3 sentences of plain-language summary.
3. A "คำถามทบทวน" (translate) section with 2–3 self-check questions to help the student review.

Keep it tight and easy to scan. Do not invent facts that are not in the note.

--- NOTE TITLE ---
${title}

--- NOTE CONTENT ---
${content}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // โมเดลเร็ว+ประหยัดสำหรับงานสรุป — เปลี่ยนได้ตามต้องการ
        // ดูรายชื่อโมเดลล่าสุด: https://docs.claude.com/en/docs/about-claude/models
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return json({ error: "เรียก AI ไม่สำเร็จ", detail: errText }, 502);
    }

    const data = await resp.json();
    const summary = (data?.content ?? [])
      .map((b: { type: string; text?: string }) => (b.type === "text" ? b.text ?? "" : ""))
      .join("")
      .trim();

    if (!summary) return json({ error: "AI ไม่ส่งผลลัพธ์กลับมา" }, 502);
    return json({ summary });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
