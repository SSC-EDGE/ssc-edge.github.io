import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return json({
        error: "Only POST requests are allowed.",
      }, 405);
    }

    if (!OPENAI_API_KEY) {
      return json({
        error: "OPENAI_API_KEY is not configured in Supabase.",
      }, 500);
    }

    const form = await req.formData();

    const file = form.get("file");

    if (!(file instanceof File)) {
      return json({
        error: "PDF file is required.",
      }, 400);
    }

    if (file.size <= 0) {
      return json({
        error: "Uploaded PDF is empty.",
      }, 400);
    }

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      return json({
        error: "Only PDF files are supported.",
      }, 400);
    }

    /*
      Convert PDF to base64.
    */

    const bytes = new Uint8Array(await file.arrayBuffer());

    const base64 = uint8ToBase64(bytes);

    /*
      Universal extraction instruction.

      IMPORTANT:
      No fixed SSC PDF layout is assumed.
    */

    const instruction = `
You are the SSC EDGE universal exam-PDF extraction engine.

Extract questions EXACTLY from the supplied PDF.

The PDF layout may be completely different from previous PDFs.

It may contain:
- selectable text
- scanned pages
- Hindi
- English
- bilingual questions
- questions split across lines
- questions split across pages
- vertical options
- horizontal options
- options written as A/B/C/D
- options written as (A)/(B)/(C)/(D)
- options written as A./B./C./D.
- mathematical expressions
- tables
- diagrams
- headers
- footers
- watermarks
- answer keys
- multiple sections

Do NOT invent, rewrite, simplify, translate or paraphrase anything.

Preserve the wording and order appearing in the PDF.

Detect:
1. Questions
2. Options
3. Correct answers
4. Subject/section if clearly identifiable
5. Explanation only if an explanation is actually present in the PDF

If the PDF contains an answer key, match answers to the corresponding questions.

If no answer key exists, correct_option must be null.

If extraction is uncertain, mark needs_review=true.

Do not guess missing text.

Return ONLY valid JSON.

JSON format:

{
  "questions": [
    {
      "question_no": 1,
      "question_text": "...",
      "options": [
        {
          "label": "A",
          "text": "..."
        },
        {
          "label": "B",
          "text": "..."
        },
        {
          "label": "C",
          "text": "..."
        },
        {
          "label": "D",
          "text": "..."
        }
      ],
      "correct_option": "A",
      "subject": null,
      "section": null,
      "explanation": null,
      "needs_review": false,
      "review_reason": null
    }
  ],
  "total_questions": 0,
  "total_options": 0,
  "total_answers": 0,
  "questions_needing_review": 0
}

Rules:

- Keep question order exactly as shown.
- Keep option order exactly as shown.
- Do not change A/B/C/D ordering.
- Do not create options that are not present.
- If a question continues on the next page, join its text correctly.
- Ignore page headers/footers unless they are part of the question.
- Do not treat answer-key numbers as questions.
- Do not treat page numbers as questions.
- If OCR is unclear, preserve what can be confidently read and mark needs_review=true.
- Mathematical notation must be preserved as accurately as possible.
- Hindi text must remain Hindi.
- English text must remain English.
- For bilingual questions, preserve both languages.
- Tables and diagrams should be represented in question_text when they are necessary to understand the question.
- Never fabricate an answer.
`;

    /*
      Send PDF directly to the model.
    */

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          model: "gpt-5.6",

          input: [
            {
              role: "user",

              content: [
                {
                  type: "input_file",

                  filename: file.name,

                  file_data:
                    `data:application/pdf;base64,${base64}`,
                },

                {
                  type: "input_text",

                  text: instruction,
                },
              ],
            },
          ],

          max_output_tokens: 50000,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      return json({
        error: "PDF processing failed.",
        details: errorText,
      }, 500);
    }

    const result = await response.json();

    /*
      Get model text.
    */

    const outputText = extractOutputText(result);

    if (!outputText) {
      return json({
        error: "No extraction result returned.",
      }, 500);
    }

    /*
      Remove accidental markdown fences.
    */

    const cleaned = outputText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return json({
        error: "The PDF processor returned invalid JSON.",
        raw_output: outputText,
      }, 500);
    }

    /*
      Validate / normalize result.
    */

    const questions = Array.isArray(parsed.questions)
      ? parsed.questions
      : [];

    const normalized = questions.map(
      (q: any, index: number) => {

        const options =
          Array.isArray(q.options)
            ? q.options
                .map((o: any, optionIndex: number) => ({
                  label:
                    String(
                      o?.label ||
                      String.fromCharCode(65 + optionIndex)
                    ).trim(),

                  text:
                    String(o?.text || "").trim(),
                }))
                .filter((o: any) => o.text)
            : [];

        let correctOption =
          q.correct_option == null
            ? null
            : String(q.correct_option)
                .trim()
                .toUpperCase();

        if (
          correctOption &&
          !options.some(
            (o: any) =>
              o.label.toUpperCase() === correctOption
          )
        ) {
          correctOption = null;
        }

        let needsReview =
          Boolean(q.needs_review);

        let reviewReason =
          q.review_reason
            ? String(q.review_reason)
            : null;

        if (!String(q.question_text || "").trim()) {
          needsReview = true;

          reviewReason =
            reviewReason ||
            "Question text could not be extracted.";
        }

        if (options.length < 2) {
          needsReview = true;

          reviewReason =
            reviewReason ||
            "Less than two options detected.";
        }

        if (
          correctOption === null
        ) {
          needsReview = true;

          reviewReason =
            reviewReason ||
            "Correct answer not detected.";
        }

        return {
          question_no:
            Number(q.question_no) || index + 1,

          question_text:
            String(q.question_text || "").trim(),

          options,

          correct_option:
            correctOption,

          subject:
            q.subject
              ? String(q.subject).trim()
              : null,

          section:
            q.section
              ? String(q.section).trim()
              : null,

          explanation:
            q.explanation
              ? String(q.explanation).trim()
              : null,

          needs_review:
            needsReview,

          review_reason:
            reviewReason,
        };
      }
    );

    const totalOptions =
      normalized.reduce(
        (sum: number, q: any) =>
          sum + q.options.length,
        0
      );

    const totalAnswers =
      normalized.filter(
        (q: any) =>
          q.correct_option !== null
      ).length;

    const needsReview =
      normalized.filter(
        (q: any) =>
          q.needs_review
      ).length;

    return json({
      success: true,

      filename: file.name,

      questions: normalized,

      total_questions:
        normalized.length,

      total_options:
        totalOptions,

      total_answers:
        totalAnswers,

      questions_needing_review:
        needsReview,

      raw_text:
        null,
    });

  } catch (error) {

    return json({
      error:
        error instanceof Error
          ? error.message
          : String(error),
    }, 500);
  }
});


function json(
  data: any,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: corsHeaders,
    }
  );
}


function uint8ToBase64(
  bytes: Uint8Array
): string {

  let binary = "";

  const chunkSize = 0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        i,
        Math.min(
          i + chunkSize,
          bytes.length
        )
      )
    );
  }

  return btoa(binary);
}


function extractOutputText(
  result: any
): string {

  if (
    typeof result.output_text === "string"
  ) {
    return result.output_text;
  }

  if (
    Array.isArray(result.output)
  ) {

    const parts: string[] = [];

    for (
      const item of result.output
    ) {

      if (
        !Array.isArray(item.content)
      ) {
        continue;
      }

      for (
        const content of item.content
      ) {

        if (
          typeof content.text === "string"
        ) {
          parts.push(content.text);
        }
      }
    }

    return parts.join("\n").trim();
  }

  return "";
        }
