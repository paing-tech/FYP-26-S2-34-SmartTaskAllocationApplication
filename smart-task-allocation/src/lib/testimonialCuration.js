// Shared by the "Curate from feedback" button
// (platformadmin/testimonials/curate route) and the curate_testimonials
// chat tool — both need the exact same AI-drafting logic, so it lives here
// once instead of duplicated between them.

// Bounds prompt size/cost per run — remaining unprocessed feedback just
// waits for the next run rather than trying to fit everything in one call.
const MAX_CANDIDATES_PER_RUN = 40;

export async function curateTestimonialsFromFeedback(supabase) {
  const { data: alreadyUsed } = await supabase
    .from("testimonial")
    .select("source_inquiry_id")
    .not("source_inquiry_id", "is", null);
  const usedInquiryIds = new Set((alreadyUsed ?? []).map((t) => t.source_inquiry_id));

  const { data: inquiries, error: inquiryError } = await supabase
    .from("support_inquiry")
    .select("inquiry_id, user_id, message, created_at")
    .eq("subject", "Feedback")
    .order("created_at", { ascending: false });

  if (inquiryError) {
    throw new Error(inquiryError.message);
  }

  const candidates = (inquiries ?? [])
    .filter((inquiry) => !usedInquiryIds.has(inquiry.inquiry_id))
    .slice(0, MAX_CANDIDATES_PER_RUN);

  if (!candidates.length) {
    return { drafted: 0, reviewed: 0, message: "No new feedback to review." };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("AI curation is unavailable — OPENAI_API_KEY is not configured.");
  }

  const prompt = `You are reviewing customer feedback submitted through a "Contact Support" form (category: Feedback) to find genuinely positive, specific feedback worth featuring as a public testimonial on the marketing website.

Feedback entries (id: message):
${candidates.map((c) => `${c.inquiry_id}: "${c.message.replace(/\n/g, " ")}"`).join("\n")}

For each entry that is clearly positive and specific enough to be a compelling public testimonial, draft a short, polished quote (1-3 sentences, first person, keep the original meaning and tone, don't invent facts not in the original) and a 1-5 star rating reflecting how positive it is. Skip entries that are neutral, negative, a bug report, a complaint, or too vague to quote.

Return ONLY JSON of the form {"testimonials":[{"inquiryId":"<exact id from above>","quote":"<drafted quote>","rating":<1-5>}]}. Return an empty array if none qualify.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI request failed.");
  }

  let parsed;
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch {
    parsed = {};
  }

  const candidateById = new Map(candidates.map((c) => [c.inquiry_id, c]));
  const drafts = (Array.isArray(parsed.testimonials) ? parsed.testimonials : []).filter(
    (item) => candidateById.has(item.inquiryId) && typeof item.quote === "string" && item.quote.trim(),
  );

  if (!drafts.length) {
    return {
      drafted: 0,
      reviewed: candidates.length,
      message: "Reviewed feedback, but none were positive or specific enough to draft into a testimonial.",
    };
  }

  const rows = drafts.map((item) => {
    const source = candidateById.get(item.inquiryId);
    const rating = Number.isInteger(item.rating) ? Math.min(5, Math.max(1, item.rating)) : null;
    return {
      user_id: source.user_id,
      rating,
      testimonial_message: item.quote.trim(),
      status: "Pending",
      is_featured: false,
      source_inquiry_id: source.inquiry_id,
    };
  });

  // The partial unique index on source_inquiry_id is the backstop against
  // double-drafting the same feedback if two curation runs ever race — the
  // usedInquiryIds check above handles the normal case, this just makes it
  // impossible even under a race, at the cost of failing the whole batch
  // if that ever actually happens (acceptable: just re-run afterward).
  const { data: inserted, error: insertError } = await supabase
    .from("testimonial")
    .insert(rows)
    .select("testimonial_id");

  if (insertError) {
    throw new Error(insertError.message);
  }

  return {
    drafted: (inserted ?? rows).length,
    reviewed: candidates.length,
    message: `Drafted ${(inserted ?? rows).length} testimonial(s) from ${candidates.length} feedback entries, awaiting your review.`,
  };
}
