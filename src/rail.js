import './style.css'
import { attach } from '@adobe/uix-guest'
import {
  INPUT_TYPES,
  createField,
  saveSpec,
  typeSupportsOptions,
} from './formSpec.js'

const EXTENSION_ID = 'com.example.ue-hosted-starter'
const SYNC_DEBOUNCE_MS = 200
const SELECTION_POLL_MS = 300

let spec = emptySpec()
let connection = null

let boundEditable = null
let boundResource = null
let suppressSync = false

const fieldsEl = document.getElementById('fields')
const titleEl = document.getElementById('formTitle')
const submitLabelEl = document.getElementById('submitLabel')
const syncStatusEl = document.getElementById('syncStatus')
const boundStatusEl = document.getElementById('boundStatus')

function emptySpec() {
  return { title: '', submitLabel: 'Submit', fields: [] }
}

function setSyncStatus(message, { hideAfterMs } = {}) {
  if (!syncStatusEl) return
  syncStatusEl.hidden = !message
  syncStatusEl.textContent = message || ''
  if (message && hideAfterMs) {
    clearTimeout(setSyncStatus._timer)
    setSyncStatus._timer = setTimeout(() => {
      syncStatusEl.hidden = true
    }, hideAfterMs)
  }
}

function setBoundStatus(message) {
  if (boundStatusEl) boundStatusEl.textContent = message
}

function slugify(value, fallback) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
}

function editableHaystack(e) {
  return [e?.type, e?.model, e?.name, e?.filter, e?.resource, e?.resourceType]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function isFormContainer(e) {
  if (!e) return false
  if (e.model === 'form') return true
  if (e.filter === 'form') return true
  if (String(e.name || '').toLowerCase() === 'form') return true
  const hay = editableHaystack(e)
  return /(^|\s)form(\s|$)/.test(hay) && !/form-field/.test(hay)
}

function resolveFormContainer(state) {
  const editables = state?.editables || []
  const selected = state?.selected || []
  const first = selected[0]
  const selectedId = typeof first === 'string' ? first : first?.id

  let editable = editables.find((e) => e.id === selectedId)
    || (typeof first === 'object' ? first : null)

  // Selected the formConfig property directly — use its parent block.
  if (editable?.prop === 'formConfig') {
    const parentId = editable.parentId || editable.parent
    const parent = editables.find((e) => e.id === parentId || e.resource === parentId)
    if (parent) editable = parent
  }

  if (editable && !isFormContainer(editable)) {
    const parentId = editable.parentId || editable.parent
    const parent = editables.find((e) => e.id === parentId || e.resource === parentId)
    if (parent && isFormContainer(parent)) editable = parent
  }

  if (isFormContainer(editable)) return editable

  // Auto-bind when the page has exactly one Form block.
  const candidates = editables.filter(isFormContainer)
  if (candidates.length === 1) return candidates[0]

  return null
}

function parseConfigString(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.fields)) return parsed
  } catch {
    // not valid JSON
  }
  return null
}

function deepScanForConfig(editable) {
  if (!editable) return null

  const direct = editable.formConfig
    ?? editable.content
    ?? editable.value
    ?? editable.properties?.formConfig
    ?? editable.data?.formConfig
  const fromDirect = parseConfigString(typeof direct === 'string' ? direct : null)
  if (fromDirect) return fromDirect

  const candidates = []
  const visit = (obj, depth) => {
    if (!obj || depth > 4 || typeof obj !== 'object') return
    Object.keys(obj).forEach((key) => {
      const value = obj[key]
      if (typeof value === 'string' && value.includes('"fields"')) {
        candidates.push(value)
      } else if (value && typeof value === 'object') {
        visit(value, depth + 1)
      }
    })
  }
  visit(editable, 0)
  for (let i = 0; i < candidates.length; i += 1) {
    const parsed = parseConfigString(candidates[i])
    if (parsed) return parsed
  }
  return null
}

function parseConfigFromDetailsData(data, editable) {
  if (data == null) return null

  if (typeof data === 'string') {
    return parseConfigString(data)
  }

  if (typeof data === 'object') {
    const raw = data.formConfig ?? data.content ?? data.value ?? data.text
    const fromField = parseConfigString(typeof raw === 'string' ? raw : null)
    if (fromField) return fromField

    if (editable?.prop === 'formConfig') {
      const fromProp = deepScanForConfig(data)
      if (fromProp) return fromProp
    }

    return deepScanForConfig(data)
  }

  return null
}

async function fetchConfigViaDetails(editable) {
  if (!connection || !editable) return null

  const attempts = [
    { editable },
    editable,
  ]

  for (let i = 0; i < attempts.length; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await connection.host.editorActions.details(attempts[i])
      const config = parseConfigFromDetailsData(result?.data, editable)
      if (config) return config
    } catch {
      // try next shape
    }
  }

  return null
}

async function loadConfigFromState(container, state) {
  if (!container || !state) return null

  const editables = state?.editables || []
  const propEditable = findFormConfigPropEditable(editables, container)

  // Saved values are returned by details(), not always present on editorState editables.
  if (propEditable) {
    const fromDetails = await fetchConfigViaDetails(propEditable)
    if (fromDetails) return fromDetails

    const fromProp = deepScanForConfig(propEditable)
    if (fromProp) return fromProp
  }

  const fromContainerDetails = await fetchConfigViaDetails(container)
  if (fromContainerDetails) return fromContainerDetails

  return deepScanForConfig(container)
}

function toConfigJSON(currentSpec) {
  return {
    title: currentSpec.title || '',
    submitLabel: currentSpec.submitLabel || 'Submit',
    fields: (currentSpec.fields || []).map((field, index) => ({
      type: field.type,
      label: field.label,
      name: field.name || slugify(field.label, `field-${index}`),
      placeholder: field.placeholder || '',
      required: !!field.required,
      options: (field.options || [])
        .map((opt) => (typeof opt === 'string' ? opt : opt.label || opt.value || ''))
        .filter(Boolean),
    })),
  }
}

function fromConfig(config) {
  return {
    title: config.title || '',
    submitLabel: config.submitLabel || 'Submit',
    fields: (config.fields || []).map((field) => createField({
      type: field.type || 'text',
      label: field.label || '',
      name: field.name || '',
      placeholder: field.placeholder || '',
      required: !!field.required,
      options: (field.options || []).map((opt) => (
        typeof opt === 'string' ? { label: opt, value: opt } : opt
      )),
    })),
  }
}

let syncTimer = null

function scheduleSync() {
  if (suppressSync) return
  if (!connection) {
    setSyncStatus('Not connected to Universal Editor.', { hideAfterMs: 2500 })
    return
  }
  if (!boundEditable) {
    setSyncStatus('Select a Form block on the page first.', { hideAfterMs: 2500 })
    return
  }
  clearTimeout(syncTimer)
  syncTimer = setTimeout(doSync, SYNC_DEBOUNCE_MS)
}

function findFormConfigPropEditable(editables, container) {
  const matchParent = (e) => {
    const parent = e.parentId || e.parent
    return parent === container.id
      || parent === container.resource
      || parent === container.id?.split?.('/')?.pop?.()
  }

  const direct = editables.find((e) => e.prop === 'formConfig' && matchParent(e))
  if (direct) return direct

  // Match by resource path when parent ids differ between host versions.
  if (container.resource) {
    const byResource = editables.find((e) => (
      e.prop === 'formConfig'
      && e.resource
      && String(e.resource).startsWith(String(container.resource))
    ))
    if (byResource) return byResource
  }

  const all = editables.filter((e) => e.prop === 'formConfig')
  if (all.length === 1) return all[0]
  return null
}

async function buildPatchAttempts(container, state) {
  const editables = state?.editables || []
  const propEditable = findFormConfigPropEditable(editables, container)

  const attempts = []
  const add = (target, path) => attempts.push({ target, path })

  // Property-level editable is what xwalk persists to the document.
  if (propEditable) {
    add({ editable: { id: propEditable.id, resource: propEditable.resource } }, '/formConfig')
    add({ editable: { id: propEditable.id } }, '/formConfig')
    add({ editable: propEditable }, '/formConfig')
    add({ editable: propEditable }, `/${propEditable.prop}`)
  }

  add({ editable: { id: container.id, resource: container.resource } }, '/formConfig')
  add({ editable: { id: container.id } }, '/formConfig')
  add({ editable: container }, '/formConfig')

  return attempts
}

async function patchFormConfig(container, value) {
  const state = await connection.host.editorState.get()
  const attempts = await buildPatchAttempts(container, state)

  let lastError
  for (let i = 0; i < attempts.length; i += 1) {
    const { target, path } = attempts[i]
    try {
      // eslint-disable-next-line no-await-in-loop
      await connection.host.editorActions.update({
        target,
        patch: [{ op: 'replace', path, value }],
      })
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('Could not patch formConfig')
}

async function doSync() {
  if (!connection || !boundEditable) return
  const value = JSON.stringify(toConfigJSON(spec))
  const fieldCount = spec.fields.length
  try {
    await patchFormConfig(boundEditable, value)
    setSyncStatus(`Synced ${fieldCount} field(s) to page preview.`, { hideAfterMs: 2000 })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[form-builder] sync failed', error)
    setSyncStatus(`Sync failed: ${error?.message || error}`)
  }
}

function loadConfigIntoRail(config) {
  suppressSync = true
  spec = fromConfig(config)
  titleEl.value = spec.title || ''
  submitLabelEl.value = spec.submitLabel || ''
  renderFields()
  suppressSync = false
}

async function bindTo(editable, resource, state) {
  boundEditable = editable
  boundResource = resource
  setBoundStatus('Authoring Form block — preview updates on the page (left).')

  const existing = await loadConfigFromState(editable, state)
  if (existing?.fields?.length) {
    loadConfigIntoRail(existing)
    setSyncStatus(`Loaded ${existing.fields.length} saved field(s).`, { hideAfterMs: 2000 })
  } else if (existing) {
    loadConfigIntoRail(existing)
  } else {
    loadConfigIntoRail(emptySpec())
  }
}

function unbind() {
  boundEditable = null
  boundResource = null
  setBoundStatus('Select a Form block on the page to author it.')
  setSyncStatus('')
}

async function pollSelection() {
  if (!connection) return
  try {
    const state = await connection.host.editorState.get()
    const container = resolveFormContainer(state)
    const resource = container?.resource || container?.id || null

    if (resource && resource !== boundResource) {
      await bindTo(container, resource, state)
    } else if (!resource && boundResource) {
      unbind()
    } else if (!resource) {
      const count = (state?.editables || []).filter(isFormContainer).length
      if (count > 1) {
        setBoundStatus('Multiple forms on page — select one to author.')
      } else if (count === 0) {
        setBoundStatus('Add a Form block to the page, then author here.')
      }
    }
  } catch {
    // editorState not available yet
  }
}

function persistAndSync() {
  if (!connection) saveSpec(spec)
  scheduleSync()
}

function optionsEditor(field) {
  const box = document.createElement('div')
  box.className = 'options-box'
  const label = document.createElement('div')
  label.className = 'form-label'
  label.textContent = 'Options'
  box.appendChild(label)

  ;(field.options || []).forEach((opt) => {
    const row = document.createElement('div')
    row.className = 'option-row'
    const input = document.createElement('input')
    input.type = 'text'
    input.value = opt.label || ''
    input.placeholder = 'Option label'
    input.addEventListener('input', () => {
      opt.label = input.value
      opt.value = input.value
      persistAndSync()
    })
    const del = document.createElement('button')
    del.type = 'button'
    del.className = 'btn-remove'
    del.textContent = '✕'
    del.addEventListener('click', () => {
      field.options = field.options.filter((o) => o !== opt)
      renderFields()
      persistAndSync()
    })
    row.append(input, del)
    box.appendChild(row)
  })

  const add = document.createElement('button')
  add.type = 'button'
  add.className = 'btn-secondary'
  add.textContent = '+ Add option'
  add.addEventListener('click', () => {
    field.options = field.options || []
    field.options.push({ label: 'Option', value: 'Option' })
    renderFields()
    persistAndSync()
  })
  box.appendChild(add)
  return box
}

function labeled(labelText, control) {
  const wrap = document.createElement('div')
  wrap.className = 'labeled'
  const label = document.createElement('label')
  label.className = 'form-label'
  label.textContent = labelText
  wrap.append(label, control)
  return wrap
}

function labeledInput(labelText, value, onInput) {
  const input = document.createElement('input')
  input.type = 'text'
  input.value = value || ''
  input.addEventListener('input', () => onInput(input.value))
  return labeled(labelText, input)
}

function fieldRow(field) {
  const wrap = document.createElement('div')
  wrap.className = 'field-card'

  const header = document.createElement('div')
  header.className = 'field-card-head'
  const title = document.createElement('span')
  title.textContent = field.label || 'Untitled field'
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'btn-remove'
  remove.textContent = 'Remove'
  remove.addEventListener('click', () => {
    spec.fields = spec.fields.filter((f) => f.id !== field.id)
    renderFields()
    persistAndSync()
  })
  header.append(title, remove)
  wrap.appendChild(header)

  wrap.appendChild(labeledInput('Label', field.label, (v) => {
    field.label = v
    title.textContent = v || 'Untitled field'
    persistAndSync()
  }))

  wrap.appendChild(labeledInput('Name (field key)', field.name, (v) => {
    field.name = v
    persistAndSync()
  }))

  const typeSelect = document.createElement('select')
  INPUT_TYPES.forEach((t) => {
    const opt = document.createElement('option')
    opt.value = t.value
    opt.textContent = t.label
    if (t.value === field.type) opt.selected = true
    typeSelect.appendChild(opt)
  })
  typeSelect.addEventListener('change', () => {
    field.type = typeSelect.value
    renderFields()
    persistAndSync()
  })
  wrap.appendChild(labeled('Type', typeSelect))

  if (field.type !== 'checkbox') {
    wrap.appendChild(labeledInput('Placeholder', field.placeholder, (v) => {
      field.placeholder = v
      persistAndSync()
    }))
  }

  const requiredLabel = document.createElement('label')
  requiredLabel.className = 'field-required'
  const requiredInput = document.createElement('input')
  requiredInput.type = 'checkbox'
  requiredInput.checked = !!field.required
  requiredInput.addEventListener('change', () => {
    field.required = requiredInput.checked
    persistAndSync()
  })
  const requiredText = document.createElement('span')
  requiredText.textContent = 'Required'
  requiredLabel.append(requiredInput, requiredText)
  wrap.appendChild(requiredLabel)

  if (typeSupportsOptions(field.type)) {
    wrap.appendChild(optionsEditor(field))
  }

  return wrap
}

function renderFields() {
  fieldsEl.innerHTML = ''
  spec.fields.forEach((field) => fieldsEl.appendChild(fieldRow(field)))
}

function init() {
  titleEl.addEventListener('input', () => {
    spec.title = titleEl.value
    persistAndSync()
  })
  submitLabelEl.addEventListener('input', () => {
    spec.submitLabel = submitLabelEl.value
    persistAndSync()
  })

  document.getElementById('addField').addEventListener('click', () => {
    spec.fields.push(createField())
    renderFields()
    persistAndSync()
  })

  renderFields()

  const status = document.getElementById('railStatus')
  attach({ id: EXTENSION_ID })
    .then((conn) => {
      connection = conn
      window.__guestConnection = conn
      if (status) status.textContent = 'Connected to Universal Editor.'

      pollSelection()
      setInterval(pollSelection, SELECTION_POLL_MS)
      conn.addEventListener('contextchange', pollSelection)
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.warn('Not attached to a host (standalone preview mode).', error)
      if (status) status.textContent = 'Standalone preview (not attached to a host).'
      setBoundStatus('Connect to Universal Editor and select a Form block.')
    })
}

init()
