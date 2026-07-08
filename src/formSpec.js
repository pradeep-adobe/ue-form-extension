const STORAGE_KEY = 'ue-extension:form-spec'

export const INPUT_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'number', label: 'Number' },
  { value: 'tel', label: 'Phone' },
  { value: 'date', label: 'Date' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'select', label: 'Dropdown' },
  { value: 'radio', label: 'Radio group' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'fragment', label: 'Fragment (reusable fields)' },
]

const OPTION_TYPES = new Set(['select', 'radio'])

export function typeSupportsOptions(type) {
  return OPTION_TYPES.has(type)
}

export function createField(overrides = {}) {
  return {
    id: `field-${Math.random().toString(36).slice(2, 9)}`,
    type: 'text',
    label: 'Untitled field',
    name: '',
    placeholder: '',
    required: false,
    options: [],
    path: '',
    ...overrides,
  }
}

export function defaultSpec() {
  return {
    title: 'Contact us',
    submitLabel: 'Submit',
    fields: [
      createField({ type: 'text', label: 'Full name', name: 'fullName', required: true }),
      createField({ type: 'email', label: 'Email', name: 'email', required: true }),
      createField({ type: 'textarea', label: 'Message', name: 'message', placeholder: 'How can we help?' }),
    ],
  }
}

export function loadSpec() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultSpec()
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.fields)) return defaultSpec()
    return parsed
  } catch {
    return defaultSpec()
  }
}

export function saveSpec(spec) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spec))
}

export function onSpecChange(callback) {
  const handler = (event) => {
    if (event.key === STORAGE_KEY) callback(loadSpec())
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

function slugify(value, fallback) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
}

function buildControl(field) {
  const name = field.name || slugify(field.label, field.id)

  if (field.type === 'textarea') {
    const el = document.createElement('textarea')
    el.name = name
    el.rows = 4
    if (field.placeholder) el.placeholder = field.placeholder
    if (field.required) el.required = true
    return el
  }

  if (field.type === 'select') {
    const el = document.createElement('select')
    el.name = name
    if (field.required) el.required = true
    const empty = document.createElement('option')
    empty.value = ''
    empty.textContent = field.placeholder || 'Select…'
    el.appendChild(empty)
    for (const opt of field.options || []) {
      const option = document.createElement('option')
      option.value = opt.value || opt.label
      option.textContent = opt.label || opt.value
      el.appendChild(option)
    }
    return el
  }

  if (field.type === 'radio') {
    const group = document.createElement('div')
    group.className = 'form-radio-group'
    ;(field.options || []).forEach((opt, index) => {
      const wrapper = document.createElement('label')
      wrapper.className = 'form-radio'
      const input = document.createElement('input')
      input.type = 'radio'
      input.name = name
      input.value = opt.value || opt.label
      if (field.required && index === 0) input.required = true
      const span = document.createElement('span')
      span.textContent = opt.label || opt.value
      wrapper.append(input, span)
      group.appendChild(wrapper)
    })
    return group
  }

  if (field.type === 'checkbox') {
    const el = document.createElement('input')
    el.type = 'checkbox'
    el.name = name
    if (field.required) el.required = true
    return el
  }

  const el = document.createElement('input')
  el.type = field.type
  el.name = name
  if (field.placeholder) el.placeholder = field.placeholder
  if (field.required) el.required = true
  return el
}

export function renderForm(spec, container, { onSubmit } = {}) {
  container.innerHTML = ''

  const form = document.createElement('form')
  form.className = 'authored-form'
  form.noValidate = false

  if (spec.title) {
    const heading = document.createElement('h2')
    heading.className = 'authored-form-title'
    heading.textContent = spec.title
    form.appendChild(heading)
  }

  for (const field of spec.fields || []) {
    const row = document.createElement('div')
    row.className = 'form-row'

    const control = buildControl(field)

    if (field.type === 'checkbox') {
      const label = document.createElement('label')
      label.className = 'form-checkbox'
      label.append(control)
      const span = document.createElement('span')
      span.textContent = field.label + (field.required ? ' *' : '')
      label.append(span)
      row.appendChild(label)
    } else {
      const label = document.createElement('label')
      label.className = 'form-label'
      label.textContent = field.label + (field.required ? ' *' : '')
      row.append(label, control)
    }

    form.appendChild(row)
  }

  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.className = 'form-submit'
  submit.textContent = spec.submitLabel || 'Submit'
  form.appendChild(submit)

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const data = Object.fromEntries(new FormData(form).entries())
    if (onSubmit) onSubmit(data)
  })

  container.appendChild(form)
  return form
}
