import {
  INPUT_TYPES,
  createField,
  typeSupportsOptions,
} from './formSpec.js'
import {
  createRulesEditor,
  fieldSupportsRules,
  serializeRules,
} from './fieldRules.js'

function slugify(value, fallback) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
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

function optionsEditor(field, notifyChange) {
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
      notifyChange()
    })
    const del = document.createElement('button')
    del.type = 'button'
    del.className = 'btn-remove'
    del.textContent = '✕'
    del.addEventListener('click', () => {
      field.options = field.options.filter((o) => o !== opt)
      notifyChange(true)
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
    notifyChange(true)
  })
  box.appendChild(add)
  return box
}

function fieldRow(field, allFields, notifyChange) {
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
    notifyChange(true, (current) => ({
      ...current,
      fields: current.fields.filter((f) => f.id !== field.id),
    }))
  })
  header.append(title, remove)
  wrap.appendChild(header)

  wrap.appendChild(labeledInput('Label', field.label, (v) => {
    field.label = v
    title.textContent = v || 'Untitled field'
    notifyChange()
  }))

  wrap.appendChild(labeledInput('Name (field key)', field.name, (v) => {
    field.name = v
    notifyChange()
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
    notifyChange(true)
  })
  wrap.appendChild(labeled('Type', typeSelect))

  if (field.type !== 'checkbox') {
    wrap.appendChild(labeledInput('Placeholder', field.placeholder, (v) => {
      field.placeholder = v
      notifyChange()
    }))
  }

  const requiredLabel = document.createElement('label')
  requiredLabel.className = 'field-required'
  const requiredInput = document.createElement('input')
  requiredInput.type = 'checkbox'
  requiredInput.checked = !!field.required
  requiredInput.addEventListener('change', () => {
    field.required = requiredInput.checked
    notifyChange()
  })
  const requiredText = document.createElement('span')
  requiredText.textContent = 'Required'
  requiredLabel.append(requiredInput, requiredText)
  wrap.appendChild(requiredLabel)

  if (typeSupportsOptions(field.type)) {
    wrap.appendChild(optionsEditor(field, notifyChange))
  }

  if (fieldSupportsRules(field.type)) {
    wrap.appendChild(createRulesEditor(field, allFields, {
      onChange: () => notifyChange(),
      rerender: () => notifyChange(true),
      slugify,
    }))
  }

  return wrap
}

/**
 * Mount a standalone form builder UI (no Universal Editor).
 * @param {HTMLElement} host
 * @param {object} initialSpec
 * @param {(spec: object) => void} onChange
 */
export function mountDevBuilder(host, initialSpec, onChange) {
  let spec = {
    title: initialSpec.title || '',
    submitLabel: initialSpec.submitLabel || 'Submit',
    fields: (initialSpec.fields || []).map((field) => createField(field)),
  }

  const fieldsEl = document.createElement('div')
  fieldsEl.id = 'devFields'

  const titleEl = document.createElement('input')
  titleEl.id = 'devFormTitle'
  titleEl.type = 'text'
  titleEl.value = spec.title || ''

  const submitLabelEl = document.createElement('input')
  submitLabelEl.id = 'devSubmitLabel'
  submitLabelEl.type = 'text'
  submitLabelEl.value = spec.submitLabel || 'Submit'

  const meta = document.createElement('section')
  meta.className = 'builder-section'
  meta.append(
    labeled('Form title', titleEl),
    labeled('Submit button label', submitLabelEl),
  )

  const fieldsSection = document.createElement('section')
  fieldsSection.className = 'builder-section'
  const head = document.createElement('div')
  head.className = 'builder-head'
  const heading = document.createElement('h2')
  heading.textContent = 'Form Fields'
  const addFieldBtn = document.createElement('button')
  addFieldBtn.type = 'button'
  addFieldBtn.className = 'btn-secondary'
  addFieldBtn.textContent = '+ Add input'
  head.append(heading, addFieldBtn)
  fieldsSection.append(head, fieldsEl)

  host.innerHTML = ''
  host.append(meta, fieldsSection)

  function notifyChange(rerenderFields = false, transform) {
    if (transform) spec = transform(spec)
    if (rerenderFields) renderFields()
    onChange({
      title: spec.title,
      submitLabel: spec.submitLabel,
      fields: spec.fields,
    })
  }

  function renderFields() {
    fieldsEl.innerHTML = ''
    spec.fields.forEach((field) => {
      fieldsEl.appendChild(fieldRow(field, spec.fields, notifyChange))
    })
  }

  titleEl.addEventListener('input', () => {
    spec.title = titleEl.value
    notifyChange()
  })

  submitLabelEl.addEventListener('input', () => {
    spec.submitLabel = submitLabelEl.value
    notifyChange()
  })

  addFieldBtn.addEventListener('click', () => {
    spec.fields.push(createField())
    notifyChange(true)
  })

  renderFields()

  return {
    setSpec(nextSpec) {
      spec = {
        title: nextSpec.title || '',
        submitLabel: nextSpec.submitLabel || 'Submit',
        fields: (nextSpec.fields || []).map((field) => createField(field)),
      }
      titleEl.value = spec.title
      submitLabelEl.value = spec.submitLabel
      renderFields()
      onChange({
        title: spec.title,
        submitLabel: spec.submitLabel,
        fields: spec.fields,
      })
    },
    getSpec() {
      return {
        title: spec.title,
        submitLabel: spec.submitLabel,
        fields: spec.fields.map((field, index) => ({
          ...field,
          name: field.name || slugify(field.label, `field-${index}`),
        })),
      }
    },
  }
}

export function toFormConfigJSON(spec) {
  return JSON.stringify({
    title: spec.title || '',
    submitLabel: spec.submitLabel || 'Submit',
    fields: (spec.fields || []).map((field, index) => {
      const serializedRules = serializeRules(field.rules)
      return {
        type: field.type,
        label: field.label,
        name: field.name || slugify(field.label, `field-${index}`),
        placeholder: field.placeholder || '',
        required: !!field.required,
        options: (field.options || [])
          .map((opt) => (typeof opt === 'string' ? opt : opt.label || opt.value || ''))
          .filter(Boolean),
        ...(serializedRules ? { rules: serializedRules } : {}),
      }
    }),
  }, null, 2)
}
