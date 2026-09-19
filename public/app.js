import * as pdfjs from './vendor/pdf.min.mjs'

pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs'

const TASKS = [
  { id: 'letter',         mr: 'पत्र मसुदा',        en: 'Letter Drafting' },
  { id: 'gr-analysis',    mr: 'शासन निर्णय विश्लेषण', en: 'GR Analysis', upload: 'pdf' },
  { id: 'note-sheet',     mr: 'टिप्पणी',           en: 'Note Sheet' },
  { id: 'whatsapp',       mr: 'व्हॉट्सॅप संदेश',     en: 'WhatsApp Message' },
  { id: 'press-note',     mr: 'प्रसिद्धी पत्रक',     en: 'Press Note' },
  { id: 'proceedings',    mr: 'सभा इतिवृत्त',       en: 'Meeting Proceedings' },
  { id: 'resolution',     mr: 'ठराव मसुदा',        en: 'Resolution Draft' },
  { id: 'inspection',     mr: 'तपासणी अहवाल',      en: 'Inspection Report' },
  { id: 'excel-analysis', mr: 'एक्सेल विश्लेषण',     en: 'Excel Analysis', upload: 'excel' },
]

const UPLOAD_SPEC = {
  pdf: {
    label: 'शासन निर्णय PDF जोडा / Upload GR PDF',
    accept: '.pdf,application/pdf',
    hint: 'PDF · up to 25 MB',
    contextLabel: 'Attached Government Resolution',
  },
  excel: {
    label: 'एक्सेल फाईल जोडा / Upload Excel File',
    accept: '.xlsx,.xls,.csv',
    hint: 'XLSX · XLS · CSV',
    contextLabel: 'Attached spreadsheet data',
  },
}

const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_EXCEL_ROWS = 400

const el = (id) => document.getElementById(id)
const form = el('draft-form')
const taskList = el('tasks')
const uploadField = el('upload-field')
const uploadLabel = el('upload-label')
const dropzone = el('dropzone')
const fileInput = el('file-input')
const dropPrompt = el('dropzone-prompt')
const dropHint = el('dropzone-hint')
const fileStatus = el('filestatus')
const details = el('details')
const generateBtn = el('generate')
const errorBox = el('error')
const actions = el('output-actions')
const paper = el('paper')
const empty = el('empty')
const draft = el('draft')
const printsheet = el('printsheet')

/** Extracted text from the attached file, or null when nothing is attached. */
let attached = null
let busy = false

// ── Task selection ────────────────────────────────────────

taskList.innerHTML = TASKS.map(
  (t, i) => `
  <label class="task">
    <input type="radio" name="task" value="${t.id}"${i === 0 ? ' checked' : ''} />
    <span class="task__face">
      <span class="task__mr">${t.mr}</span>
      <span class="task__en">${t.en}</span>
    </span>
  </label>`,
).join('')

const currentTask = () => TASKS.find((t) => t.id === form.task.value) ?? TASKS[0]

function syncUploadField() {
  const spec = UPLOAD_SPEC[currentTask().upload]
  clearAttachment()
  if (!spec) {
    uploadField.hidden = true
    return
  }
  uploadField.hidden = false
  uploadLabel.textContent = spec.label
  fileInput.setAttribute('accept', spec.accept)
  dropHint.textContent = spec.hint
}

function clearAttachment() {
  attached = null
  fileInput.value = ''
  fileStatus.textContent = ''
  fileStatus.classList.remove('is-error')
  dropzone.classList.remove('is-loaded', 'is-over')
  dropPrompt.textContent = 'Choose a file or drop it here'
}

taskList.addEventListener('change', syncUploadField)
syncUploadField()

// ── File reading ──────────────────────────────────────────

async function readPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjs.getDocument({ data }).promise
  const pages = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const content = await page.getTextContent()
    const text = content.items.map((item) => item.str ?? '').join(' ').replace(/[ \t]+/g, ' ').trim()
    if (text) pages.push(`--- पृष्ठ / Page ${n} ---\n${text}`)
    fileStatus.textContent = `Reading page ${n} of ${pdf.numPages}…`
  }
  if (!pages.length) {
    throw new Error('No selectable text found. This PDF is probably a scanned image, which cannot be read automatically.')
  }
  return { text: pages.join('\n\n'), note: `${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'} read` }
}

async function readSpreadsheet(file) {
  if (typeof XLSX === 'undefined') throw new Error('The spreadsheet reader failed to load. Please refresh the page.')
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const blocks = []
  let rowCount = 0
  for (const name of book.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, blankrows: false, defval: '' })
    if (!rows.length) continue
    const slice = rows.slice(0, MAX_EXCEL_ROWS)
    rowCount += rows.length
    const table = slice.map((row) => row.map((cell) => String(cell ?? '').trim()).join(' | ')).join('\n')
    const clipped = rows.length > slice.length ? `\n[… ${rows.length - slice.length} further rows not included]` : ''
    blocks.push(`=== Sheet: ${name} (${rows.length} rows) ===\n${table}${clipped}`)
  }
  if (!blocks.length) throw new Error('This workbook has no data rows.')
  return { text: blocks.join('\n\n'), note: `${rowCount} row${rowCount === 1 ? '' : 's'} across ${book.SheetNames.length} sheet(s)` }
}

async function handleFile(file) {
  if (!file) return
  clearAttachment()
  if (file.size > MAX_FILE_BYTES) {
    fileStatus.textContent = 'That file is larger than 25 MB. Please attach a smaller file.'
    fileStatus.classList.add('is-error')
    return
  }
  dropPrompt.textContent = file.name
  fileStatus.textContent = 'Reading file…'
  try {
    const kind = currentTask().upload
    const { text, note } = kind === 'pdf' ? await readPdf(file) : await readSpreadsheet(file)
    attached = { text, label: UPLOAD_SPEC[kind].contextLabel }
    dropzone.classList.add('is-loaded')
    fileStatus.classList.remove('is-error')
    fileStatus.textContent = `${file.name} — ${note}.`
  } catch (err) {
    attached = null
    fileStatus.classList.add('is-error')
    fileStatus.textContent = err instanceof Error ? err.message : 'That file could not be read.'
  }
}

fileInput.addEventListener('change', (e) => handleFile(e.target.files?.[0]))

for (const evt of ['dragenter', 'dragover']) {
  dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('is-over') })
}
for (const evt of ['dragleave', 'drop']) {
  dropzone.addEventListener(evt, () => dropzone.classList.remove('is-over'))
}
dropzone.addEventListener('drop', (e) => { e.preventDefault(); handleFile(e.dataTransfer?.files?.[0]) })

// ── Generation ────────────────────────────────────────────

function showError(message) {
  errorBox.textContent = message
  errorBox.hidden = false
}

function setBusy(state) {
  busy = state
  generateBtn.disabled = state
  generateBtn.querySelector('.generate__label').textContent = state
    ? 'तयार होत आहे… · Generating'
    : 'मसुदा तयार करा · Generate'
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (busy) return

  errorBox.hidden = true
  const task = currentTask()
  const text = details.value.trim()

  if (!text && !attached) {
    showError(task.upload
      ? 'Enter the details, or attach a file to work from.'
      : 'Enter the details for this document.')
    details.focus()
    return
  }

  setBusy(true)
  empty.hidden = true
  draft.hidden = false
  draft.textContent = ''
  draft.classList.add('is-streaming')
  actions.hidden = true

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: task.id,
        language: form.language.value,
        details: text,
        context: attached?.text ?? '',
        contextLabel: attached?.label ?? '',
      }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload.error || `The service returned an error (${response.status}).`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      draft.textContent += decoder.decode(value, { stream: true })
      paper.scrollTop = paper.scrollHeight
    }

    if (!draft.textContent.trim()) throw new Error('The service returned an empty draft. Please try again.')
    actions.hidden = false
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    if (!draft.textContent.trim()) {
      draft.hidden = true
      empty.hidden = false
    }
  } finally {
    draft.classList.remove('is-streaming')
    setBusy(false)
  }
})

// ── Output actions ────────────────────────────────────────

const fileStem = () => `KHAN_AI_${currentTask().en.replace(/\s+/g, '_')}`

el('copy-btn').addEventListener('click', async (e) => {
  const btn = e.currentTarget
  try {
    await navigator.clipboard.writeText(draft.textContent)
    btn.textContent = 'Copied'
  } catch {
    btn.textContent = 'Press Ctrl+C'
    const range = document.createRange()
    range.selectNodeContents(draft)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }
  setTimeout(() => { btn.textContent = 'Copy' }, 2000)
})

el('txt-btn').addEventListener('click', () => {
  const blob = new Blob(['﻿' + draft.textContent], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileStem()}.txt`
  link.click()
  URL.revokeObjectURL(url)
})

el('pdf-btn').addEventListener('click', () => {
  const task = currentTask()
  const stamp = new Date().toLocaleDateString(form.language.value === 'Marathi' ? 'mr-IN' : 'en-IN')
  printsheet.innerHTML = ''
  const head = document.createElement('p')
  head.className = 'printsheet__head'
  head.textContent = `KHAN AI Office Pro · ${task.en} · ${stamp}`
  const body = document.createElement('div')
  body.textContent = draft.textContent
  printsheet.append(head, body)
  window.print()
})
