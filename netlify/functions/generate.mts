import { GoogleGenAI } from '@google/genai'
import type { Config } from '@netlify/functions'

const allowedTasks = new Set([
  'Letter Drafting',
  'GR Analysis',
  'Note Sheet',
  'WhatsApp Message',
  'Press Note',
  'Meeting Proceedings',
  'Resolution Draft',
  'Inspection Report',
  'Excel Analysis',
])

const allowedLanguages = new Set(['Marathi', 'English'])

export default async (request: Request) => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405 })
  }

  try {
    const body = await request.json()
    const task = typeof body.task === 'string' ? body.task : ''
    const language = typeof body.language === 'string' ? body.language : ''
    const details = typeof body.details === 'string' ? body.details.trim() : ''
    const documentText = typeof body.documentText === 'string' ? body.documentText.trim() : ''

    if (!allowedTasks.has(task) || !allowedLanguages.has(language)) {
      return Response.json({ error: 'Invalid task or language.' }, { status: 400 })
    }

    if (!details && !documentText) {
      return Response.json({ error: 'Enter details or attach a document.' }, { status: 400 })
    }

    const sourceMaterial = documentText
      ? `\nAttached document content:\n${documentText.slice(0, 30000)}\n`
      : ''

    const prompt = `
You are KHAN AI Office Pro, an assistant for Maharashtra government office drafting.

Task Type: ${task}
Language: ${language}

Requirements:
- If the language is Marathi, write in formal, official Marathi.
- If the language is English, write in professional official English.
- Follow Maharashtra Government drafting conventions.
- Produce a complete, ready-to-use result without commentary about these instructions.
- For Letter Drafting, include Subject, Reference, and Main Letter.
- For Note Sheet, use an official note format.
- For Press Note, produce media-ready content.
- For Resolution Draft, produce a Gram Panchayat resolution.
- For WhatsApp Message, produce a concise official message.
- For Excel Analysis, include summary, key findings, totals, trends, and recommendations.
- For GR Analysis, include Summary, Important Instructions, Action Points, Responsibility of BDO, and Responsibility of Gram Panchayat.
${sourceMaterial}
User request:
${details.slice(0, 10000)}
`

    const ai = new GoogleGenAI({})
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    })

    const output = response.text?.trim()
    if (!output) {
      throw new Error('The AI service returned an empty response.')
    }

    return Response.json({ output })
  } catch (error) {
    console.error('Generation failed', error instanceof Error ? error.message : 'Unknown error')
    return Response.json(
      { error: 'Unable to generate the document right now. Please try again.' },
      { status: 500 },
    )
  }
}

export const config: Config = {
  path: '/api/generate',
}
