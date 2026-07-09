import './style.css'
import './devStudio.css'
import { defaultSpec, loadSpec, saveSpec } from './formSpec.js'
import { renderFormApp } from './formAppLoader.js'
import { TFS_FORM_APP } from './config.js'
import { mountDevBuilder, toFormConfigJSON } from './devBuilder.js'

const PREVIEW_DEBOUNCE_MS = 150

const appStatusEl = document.getElementById('appStatus')
const previewStatusEl = document.getElementById('previewStatus')
const previewHost = document.getElementById('previewHost')
const authorPanel = document.getElementById('authorPanel')
const resetBtn = document.getElementById('resetSpec')
const copyJsonBtn = document.getElementById('copyJson')

let previewTimer = null
let formAppReady = false
let builder

function setAppStatus(message, variant = 'info') {
  if (!appStatusEl) return
  appStatusEl.textContent = message
  appStatusEl.dataset.variant = variant
}

function setPreviewStatus(message) {
  if (previewStatusEl) previewStatusEl.textContent = message
}

async function ensureFormApp() {
  try {
    await renderFormApp(previewHost, { title: '', submitLabel: 'Submit', fields: [] })
    formAppReady = true
    setAppStatus(`Connected to ${TFS_FORM_APP.scriptUrl}`, 'success')
    return true
  } catch (error) {
    formAppReady = false
    setAppStatus(
      `Could not load tfs-form-app. Run "npm run dev" in tfs-form-app (port 3001) and trust its certificate. (${error.message})`,
      'error',
    )
    if (previewHost) {
      previewHost.innerHTML = '<p class="dev-preview-error">Start tfs-form-app to see the live React preview.</p>'
    }
    return false
  }
}

function schedulePreview(spec) {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    renderPreview(spec)
  }, PREVIEW_DEBOUNCE_MS)
}

async function renderPreview(spec) {
  if (!formAppReady) {
    const ok = await ensureFormApp()
    if (!ok) return
  }

  try {
    await renderFormApp(previewHost, spec)
    const count = spec.fields?.length || 0
    setPreviewStatus(`Live preview · ${count} field${count === 1 ? '' : 's'}`)
  } catch (error) {
    formAppReady = false
    setPreviewStatus('Preview failed')
    setAppStatus(`Preview error: ${error.message}`, 'error')
  }
}

function handleSpecChange(spec) {
  saveSpec(spec)
  schedulePreview(spec)
}

async function init() {
  if (!authorPanel) return

  const initial = loadSpec()
  builder = mountDevBuilder(authorPanel, initial, handleSpecChange)

  resetBtn?.addEventListener('click', () => {
    const sample = defaultSpec()
    builder.setSpec(sample)
    saveSpec(sample)
    schedulePreview(sample)
  })

  copyJsonBtn?.addEventListener('click', async () => {
    const json = toFormConfigJSON(builder.getSpec())
    try {
      await navigator.clipboard.writeText(json)
      setPreviewStatus('formConfig JSON copied to clipboard')
    } catch {
      setPreviewStatus('Could not copy — check browser clipboard permissions')
    }
  })

  await ensureFormApp()
  await renderPreview(initial)
}

init()
