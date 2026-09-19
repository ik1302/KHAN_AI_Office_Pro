import type { Config, Context } from '@netlify/functions'
import { GoogleGenAI } from '@google/genai'

const MODEL = 'gemini-3.8-flash'

/** Hard ceiling on caller-supplied text, so an oversized upload cannot blow the context window. */
const MAX_DETAILS = 20_000
const MAX_CONTEXT = 100_000

type TaskId =
  | 'letter'
  | 'gr-analysis'
  | 'note-sheet'
  | 'whatsapp'
  | 'press-note'
  | 'proceedings'
  | 'resolution'
  | 'inspection'
  | 'excel-analysis'

const TASKS: Record<TaskId, { label: string; instruction: string }> = {
  letter: {
    label: 'Letter Drafting',
    instruction: `Draft a complete official letter. Include, in order:
- जा.क्र. / Outward number placeholder and दिनांक / date placeholder
- प्रति / To (designation and office of the addressee)
- विषय / Subject - one precise sentence
- संदर्भ / Reference - list the letters, GRs or orders relied upon, numbered
- The body: opening courtesy, the substance broken into numbered paragraphs, and the specific action sought
- Closing salutation, designation block and प्रत / copy-to list`,
  },
  'gr-analysis': {
    label: 'GR Analysis',
    instruction: `Analyse the attached Government Resolution under these exact headings:
1. सारांश / Summary - what this GR orders, in plain language
2. महत्त्वाच्या सूचना / Important Instructions - every binding instruction, numbered
3. कार्यवाही मुद्दे / Action Points - concrete steps with who acts and by when
4. गट विकास अधिकारी यांची जबाबदारी / Responsibility of BDO
5. ग्रामपंचायतीची जबाबदारी / Responsibility of Gram Panchayat
Quote the GR's own clause numbers wherever you rely on them. If the GR is silent on a heading, say so rather than inventing content.`,
  },
  'note-sheet': {
    label: 'Note Sheet',
    instruction: `Produce an official note sheet in standard Government format:
- विषय / Subject
- प्रस्तावना / Background with the file history and references
- वस्तुस्थिती / Facts, numbered
- अभिप्राय / Observations, including the rule or GR position
- प्रस्ताव / Proposal put up for orders, stated as a clear recommendation
- मान्यतेसाठी सादर / Submitted for approval, with the signature and designation block`,
  },
  whatsapp: {
    label: 'WhatsApp Message',
    instruction: `Write a short official WhatsApp message - 60 to 120 words. Formal but readable on a phone. No letterhead, no reference numbers unless essential. Use line breaks generously and at most a few restrained emoji only if genuinely appropriate for the office context. End with the sending office's name.`,
  },
  'press-note': {
    label: 'Press Note',
    instruction: `Write a media-ready press note:
- Headline
- Place and date line
- A lead paragraph carrying the whole story in two or three sentences
- Supporting paragraphs with specifics, figures and quotes attributed to the appropriate officer
- A closing contact line for the information officer
Neutral, factual, publishable as received.`,
  },
  proceedings: {
    label: 'Meeting Proceedings',
    instruction: `Record formal meeting proceedings (इतिवृत्त):
- Meeting title, date, time, venue and chairperson
- उपस्थिती / Attendance, with designations
- Confirmation of the previous meeting's proceedings
- Subject-wise discussion, numbered, each with the discussion followed by निर्णय / Decision
- कार्यवाही / Action with the responsible officer and deadline against each decision
- Vote of thanks and close`,
  },
  resolution: {
    label: 'Resolution Draft',
    instruction: `Draft a Gram Panchayat resolution (ग्रामपंचायत ठराव):
- ठराव क्रमांक / Resolution number and दिनांक / date placeholders
- The meeting and chairperson under whose authority it is passed
- The proposal placed before the body
- The operative resolution, worded as a formal resolution ("असा ठराव करण्यात येतो की...")
- Proposer and seconder lines, and whether passed unanimously or by majority
- Signature block for सरपंच and ग्रामविकास अधिकारी
Cite the enabling provision of the Maharashtra Village Panchayats Act where relevant.`,
  },
  inspection: {
    label: 'Inspection Report',
    instruction: `Write an inspection report:
- Office or work inspected, date of inspection, and the inspecting officer
- Scope of inspection
- Observations, numbered, separating what was found satisfactory from what was not
- अनियमितता / Irregularities noticed, each with its seriousness
- शिफारशी / Recommendations with a compliance deadline against each
- Compliance-report-due line and signature block`,
  },
  'excel-analysis': {
    label: 'Excel Analysis',
    instruction: `Analyse the attached spreadsheet data:
1. सारांश / Summary of what this data represents
2. प्रमुख निष्कर्ष / Key Findings, numbered, each citing the figures behind it
3. एकूण आकडेवारी / Totals and aggregates for the meaningful numeric columns
4. कल / Trends and outliers, naming the specific rows or categories
5. शिफारशी / Recommendations for administrative action
Work only from the rows supplied. If a total looks incomplete because only part of the sheet was supplied, say so.`,
  },
}

function buildPrompt(args: {
  task: TaskId
  language: 'Marathi' | 'English'
  details: string
  context?: string
  contextLabel?: string
}): string {
  const { task, language, details, context, contextLabel } = args
  const spec = TASKS[task]

  const languageRule =
    language === 'Marathi'
      ? `Write the entire output in official administrative Marathi (शासकीय मराठी) as used in Maharashtra Government correspondence. Keep established English technical terms where Marathi drafting convention keeps them. Do not add an English translation.`
      : `Write the entire output in professional official English as used in Maharashtra Government correspondence.`

  return [
    `You are a senior drafting assistant in a Maharashtra Government office, preparing documents for a Block Development Office.`,
    ``,
    `# Task: ${spec.label}`,
    ``,
    spec.instruction,
    ``,
    `# Language`,
    languageRule,
    ``,
    `# Drafting standards`,
    `- Follow Maharashtra Government drafting style and official tone throughout.`,
    `- Produce the finished document only. No preamble, no explanation of what you are about to do, no closing commentary.`,
    `- Deliver the whole document. Never stop at an outline or leave a section as "to be filled".`,
    `- Where a fact is genuinely not supplied, leave a clearly marked blank such as [दिनांक] or [जा.क्र.] instead of inventing names, numbers or dates.`,
    `- Use plain text with clear headings and numbering. No markdown tables, no ** ** emphasis markers.`,
    ``,
    context
      ? `# ${contextLabel ?? 'Attached document'}\n\n${context}\n`
      : ``,
    `# Officer's instructions`,
    ``,
    details || '(No further details supplied. Produce a well-formed template for this document type with clearly marked blanks.)',
  ]
    .filter((line) => line !== undefined)
    .join('\n')
}

export default async (req: Request, _context: Context) => {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Request body must be JSON.' }, { status: 400 })
  }

  const task = String(body.task ?? '') as TaskId
  if (!(task in TASKS)) {
    return Response.json({ error: `Unknown task "${task}".` }, { status: 400 })
  }

  const language = body.language === 'English' ? 'English' : 'Marathi'
  const details = String(body.details ?? '').slice(0, MAX_DETAILS)
  const rawContext = String(body.context ?? '')
  const context = rawContext.slice(0, MAX_CONTEXT)
  const contextLabel = body.contextLabel ? String(body.contextLabel).slice(0, 120) : undefined

  if (!details.trim() && !context.trim()) {
    return Response.json(
      { error: 'Enter the details for this document, or attach a file to work from.' },
      { status: 400 },
    )
  }

  const prompt = buildPrompt({ task, language, details, context, contextLabel })

  let stream: AsyncGenerator<{ text?: string }>
  try {
    const ai = new GoogleGenAI({})
    stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: prompt,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('AI Gateway request failed:', message)
    return Response.json(
      { error: 'The drafting service could not be reached. Please try again.' },
      { status: 502 },
    )
  }

  const encoder = new TextEncoder()
  const truncated = rawContext.length > MAX_CONTEXT

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          if (truncated) {
            controller.enqueue(
              encoder.encode(
                `[सूचना / Note: only the first ${MAX_CONTEXT.toLocaleString()} characters of the attached file were analysed.]\n\n`,
              ),
            )
          }
          for await (const chunk of stream) {
            if (chunk.text) controller.enqueue(encoder.encode(chunk.text))
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          console.error('Streaming failed mid-response:', message)
          controller.enqueue(
            encoder.encode('\n\n[The response was interrupted before it finished. Please generate again.]'),
          )
        } finally {
          controller.close()
        }
      },
    }),
    {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
    },
  )
}

export const config: Config = {
  path: '/api/generate',
  method: 'POST',
}
