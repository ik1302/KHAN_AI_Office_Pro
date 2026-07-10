import * as pdfjs from 'pdfjs-dist'
import ExcelJS from 'exceljs'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

const form = document.querySelector('#draft-form')
const taskSelect = document.querySelector('#task')
const detailsInput = document.querySelector('#details')
const uploadWrap = document.querySelector('#upload-wrap')
const uploadTitle = document.querySelector('#upload-title')
const uploadHelp = document.querySelector('#upload-help')
const sourceFile = document.querySelector('#source-file')
const fileStatus = document.querySelector('#file-status')
const formError = document.querySelector('#form-error')
const generateButton = document.querySelector('#generate-button')
const emptyState = document.querySelector('#empty-state')
const loadingState = document.querySelector('#loading-state')
const resultState = document.querySelector('#result-state')
const output = document.querySelector('#output')

function configureUpload() {
  const task = taskSelect.value
  const acceptsPdf = task === 'GR Analysis'
  const acceptsExcel = task === 'Excel Analysis'
  uploadWrap.hidden = !acceptsPdf && !acceptsExcel
  sourceFile.value = ''
  fileStatus.textContent = ''

  if (acceptsPdf) {
    sourceFile.accept = '.pdf,application/pdf'
    uploadTitle.textContent = 'Attach Government Resolution PDF'
    uploadHelp.textContent = 'PDF, up to 8 MB'
  } else if (acceptsExcel) {
    sourceFile.accept = '.xlsx,.xls'
    uploadTitle.textContent = 'Attach Excel workbook'
    uploadHelp.textContent = 'XLSX or XLS, up to 8 MB'
  }
}

async function extractPdf(file) {
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
  }
  return pages.join('\n\n')
}

async function extractSpreadsheet(file) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheets = []

  workbook.worksheets.slice(0, 5).forEach((worksheet) => {
    const rows = []
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > 101) return
      rows.push(row.values.slice(1).map((value) => {
        if (value && typeof value === 'object' && 'text' in value) return value.text
        if (value && typeof value === 'object' && 'result' in value) return value.result
        return value ?? ''
      }).join('\t'))
    })
    sheets.push(`Sheet: ${worksheet.name}\n${rows.join('\n')}`)
  })

  return sheets.join('\n\n')
}

async function getDocumentText() {
  const file = sourceFile.files[0]
  if (!file) return ''
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose a file smaller than 8 MB.')

  fileStatus.textContent = `Reading ${file.name}…`
  const text = taskSelect.value === 'GR Analysis'
    ? await extractPdf(file)
    : await extractSpreadsheet(file)
  fileStatus.textContent = `${file.name} is ready for analysis.`
  return text
}

function showLoading() {
  emptyState.hidden = true
  resultState.hidden = true
  loadingState.hidden = false
  generateButton.disabled = true
  generateButton.querySelector('span').textContent = 'Generating draft…'
}

function stopLoading() {
  loadingState.hidden = true
  generateButton.disabled = false
  generateButton.querySelector('span').textContent = 'Generate official draft'
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  formError.textContent = ''

  try {
    if (!detailsInput.value.trim() && !sourceFile.files[0]) {
      throw new Error('Enter instructions or attach a document to continue.')
    }

    showLoading()
    const documentText = await getDocumentText()
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: taskSelect.value,
        language: document.querySelector('#language').value,
        details: detailsInput.value,
        documentText,
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to generate the document.')

    output.textContent = data.output
    resultState.hidden = false
    resultState.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (error) {
    formError.textContent = error instanceof Error ? error.message : 'Something went wrong. Please try again.'
    if (!output.textContent) emptyState.hidden = false
  } finally {
    stopLoading()
  }
})

sourceFile.addEventListener('change', () => {
  fileStatus.textContent = sourceFile.files[0] ? `${sourceFile.files[0].name} selected.` : ''
})

document.querySelector('#copy-button').addEventListener('click', async (event) => {
  await navigator.clipboard.writeText(output.textContent)
  event.currentTarget.textContent = 'Copied'
  setTimeout(() => { event.currentTarget.textContent = 'Copy text' }, 1600)
})

document.querySelector('#print-button').addEventListener('click', () => window.print())
taskSelect.addEventListener('change', configureUpload)
configureUpload()
