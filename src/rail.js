import './style.css'
import { attach } from '@adobe/uix-guest'
import {
  INPUT_TYPES,
  createField,
  loadSpec,
  saveSpec,
  renderForm,
  typeSupportsOptions,
} from './formSpec.js'

const EXTENSION_ID = 'com.example.ue-hosted-starter'

let spec = loadSpec()
let connection = null

const fieldsEl = document.getElementById('fields')
const previewEl = document.getElementById('preview')
const titleEl = document.getElementById('formTitle')
const submitLabelEl = document.getElementById('submitLabel')
const syncStatusEl = document.getElementById('syncStatus')

// The component id from poc-tfs-form/component-definition.json used for each input.
const FORM_FIELD_COMPONENT_ID = 'form-field'

function setSyncStatus(message) {
  if (!syncStatusEl) return
  syncStatusEl.hidden = false
  syncStatusEl.textContent = message
}

function toast(variant, message) {
  try {
    connection?.host?.editorActions?.toast(variant, message)
  } catch {
    // toast is best-effort; ignore when not attached to a host
  }
}

// Heuristics to recognise the Form block and its Form Field children in the
// editor state. The exact editable shape varies by host, so we probe several
// common properties (filter/model/type/name/resource/resourceType).
function editableHaystack(e) {
  return [e?.type, e?.model, e?.name, e?.filter, e?.resource, e?.resourceType]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function isFormFieldEditable(e) {
  if (!e) return false
  if (e.model === 'form-field') return true
  return /form-field/.test(editableHaystack(e))
}

function isFormContainer(e) {
  if (!e) return false
  if (isFormFieldEditable(e)) return false
  if (e.filter === 'form') return true
  return /(^|[^-])form(\b|[^-])/.test(editableHaystack(e))
}

// Resolve the Form block container the author currently has selected. Falls
// back to searching all editables for a Form block when nothing is selected.
async function resolveFormContainer(conn) {
  const state = await conn.host.editorState.get()
  // eslint-disable-next-line no-console
  console.log('[form-builder] editorState', state)

  const editables = state?.editables || []
  const selected = state?.selected || []
  const first = selected[0]
  const selectedId = typeof first === 'string' ? first : first?.id

  let editable = editables.find((e) => e.id === selectedId) || (typeof first === 'object' ? first : null)

  // If a child field is selected, climb to its parent container.
  if (editable && isFormFieldEditable(editable)) {
    const parentId = editable.parentId || editable.parent
    const parent = editables.find((e) => e.id === parentId)
    if (parent) editable = parent
  }

  if (isFormContainer(editable)) return editable

  // No usable selection: search editables for a Form block container.
  const candidates = editables.filter(isFormContainer)
  // eslint-disable-next-line no-console
  console.log('[form-builder] container candidates', candidates)
  if (candidates.length === 1) return candidates[0]

  // Last resort: use whatever is selected (author may have picked the block
  // even if our heuristics did not recognise it), otherwise the first block.
  if (editable) return editable
  if (candidates.length > 0) return candidates[0]

  // eslint-disable-next-line no-console
  console.warn('[form-builder] no Form block found. editables:', editables.length, 'selected:', selected)
  return null
}

function fieldPatches(field) {
  const patches = [
    ['/type', field.type || 'text'],
    ['/label', field.label || ''],
    ['/required', !!field.required],
  ]
  if (typeSupportsOptions(field.type)) {
    patches.push(['/options', (field.options || []).map((o) => o.label || o.value).join('\n')])
  }
  return patches
}

// Adds one Form Field to the container, then writes its properties. The add
// action does not return the new editable, so we diff editor state to find it.
async function addFieldToContainer(conn, container, field) {
  const before = new Set(((await conn.host.editorState.get())?.editables || []).map((e) => e.id))
  await conn.host.editorActions.add(container, FORM_FIELD_COMPONENT_ID)
  const after = (await conn.host.editorState.get())?.editables || []
  const created = after.find((e) => !before.has(e.id))
  if (!created) {
    // eslint-disable-next-line no-console
    console.warn('[form-builder] could not locate newly added field editable')
    return
  }
  for (const [path, value] of fieldPatches(field)) {
    try {
      await conn.host.editorActions.update({
        target: { editable: created },
        patch: [{ op: 'replace', path, value }],
      })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[form-builder] update failed for', path, error)
    }
  }
}

async function applyToBlock() {
  if (!connection) {
    setSyncStatus('Not connected to Universal Editor (standalone preview).')
    return
  }
  try {
    const container = await resolveFormContainer(connection)
    if (!container) {
      setSyncStatus('No Form block found. Click the Form block on the page, then apply. (See console: [form-builder] editorState)')
      toast('negative', 'Select the Form block first')
      return
    }
    const total = spec.fields.length
    setSyncStatus(`Adding ${total} field(s) to the Form block…`)
    for (const field of spec.fields) {
      // sequential so ordering is preserved (add appends as last child)
      await addFieldToContainer(connection, container, field)
    }
    setSyncStatus(`Done. Added ${total} field(s) to the selected Form block.`)
    toast('positive', 'Form fields added to the block')
    await connection.host.editorActions.refreshPage?.()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[form-builder] apply failed', error)
    setSyncStatus(`Failed: ${error?.message || error}`)
    toast('negative', 'Failed to add fields (see console)')
  }
}

function persist() {
  saveSpec(spec)
  renderPreview()
}

function renderPreview() {
  renderForm(spec, previewEl)
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
    render()
    persist()
  })
  header.append(title, remove)
  wrap.appendChild(header)

  wrap.appendChild(labeledInput('Label', field.label, (v) => {
    field.label = v
    title.textContent = v || 'Untitled field'
    persist()
  }))

  wrap.appendChild(labeledInput('Name (field key)', field.name, (v) => {
    field.name = v
    persist()
  }))

  const typeSelect = document.createElement('select')
  for (const t of INPUT_TYPES) {
    const opt = document.createElement('option')
    opt.value = t.value
    opt.textContent = t.label
    if (t.value === field.type) opt.selected = true
    typeSelect.appendChild(opt)
  }
  typeSelect.addEventListener('change', () => {
    field.type = typeSelect.value
    render()
    persist()
  })
  wrap.appendChild(labeled('Type', typeSelect))

  if (field.type !== 'checkbox') {
    wrap.appendChild(labeledInput('Placeholder', field.placeholder, (v) => {
      field.placeholder = v
      persist()
    }))
  }

  const requiredLabel = document.createElement('label')
  requiredLabel.className = 'field-required'
  const requiredInput = document.createElement('input')
  requiredInput.type = 'checkbox'
  requiredInput.checked = !!field.required
  requiredInput.addEventListener('change', () => {
    field.required = requiredInput.checked
    persist()
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
      persist()
    })
    const del = document.createElement('button')
    del.type = 'button'
    del.className = 'btn-remove'
    del.textContent = '✕'
    del.addEventListener('click', () => {
      field.options = field.options.filter((o) => o !== opt)
      render()
      persist()
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
    render()
    persist()
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

function render() {
  fieldsEl.innerHTML = ''
  spec.fields.forEach((field) => fieldsEl.appendChild(fieldRow(field)))
  renderPreview()
}

function init() {
  titleEl.value = spec.title || ''
  submitLabelEl.value = spec.submitLabel || ''

  titleEl.addEventListener('input', () => {
    spec.title = titleEl.value
    persist()
  })
  submitLabelEl.addEventListener('input', () => {
    spec.submitLabel = submitLabelEl.value
    persist()
  })

  document.getElementById('addField').addEventListener('click', () => {
    spec.fields.push(createField())
    render()
    persist()
  })

  document.getElementById('applyToBlock').addEventListener('click', () => {
    applyToBlock()
  })

  render()

  const status = document.getElementById('railStatus')
  attach({ id: EXTENSION_ID })
    .then((conn) => {
      connection = conn
      window.__guestConnection = conn
      if (status) status.textContent = 'Connected to Universal Editor.'
    })
    .catch((error) => {
      console.warn('Not attached to a host (standalone preview mode).', error)
      if (status) status.textContent = 'Standalone preview (not attached to a host).'
    })
}

init()
