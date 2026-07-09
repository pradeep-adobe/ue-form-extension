export const RULE_ACTIONS = [
  { value: 'show', label: 'Show this field when' },
  { value: 'hide', label: 'Hide this field when' },
]

export const RULE_MATCHES = [
  { value: 'all', label: 'All conditions match' },
  { value: 'any', label: 'Any condition matches' },
]

export const RULE_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'notEquals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'isEmpty', label: 'is empty' },
  { value: 'isNotEmpty', label: 'is not empty' },
  { value: 'checked', label: 'is checked' },
  { value: 'notChecked', label: 'is not checked' },
]

const VALUE_LESS_OPERATORS = new Set(['isEmpty', 'isNotEmpty', 'checked', 'notChecked'])
const SKIP_RULE_TYPES = new Set(['fragment', 'submit'])

export function fieldSupportsRules(type) {
  return !SKIP_RULE_TYPES.has(type)
}

export function defaultRules() {
  return {
    enabled: false,
    action: 'show',
    match: 'all',
    conditions: [],
  }
}

export function normalizeRules(rules) {
  const base = defaultRules()
  if (!rules || typeof rules !== 'object') return base
  return {
    enabled: !!rules.enabled,
    action: rules.action === 'hide' ? 'hide' : 'show',
    match: rules.match === 'any' ? 'any' : 'all',
    conditions: Array.isArray(rules.conditions)
      ? rules.conditions.map((condition) => ({
        field: condition?.field || '',
        operator: RULE_OPERATORS.some((op) => op.value === condition?.operator)
          ? condition.operator
          : 'equals',
        value: condition?.value ?? '',
      }))
      : [],
  }
}

export function serializeRules(rules) {
  const normalized = normalizeRules(rules)
  if (!normalized.enabled || !normalized.conditions.length) return undefined
  return {
    action: normalized.action,
    match: normalized.match,
    conditions: normalized.conditions
      .filter((condition) => condition.field)
      .map((condition) => ({
        field: condition.field,
        operator: condition.operator,
        value: condition.value ?? '',
      })),
  }
}

export function parseRules(raw) {
  if (!raw) return defaultRules()
  return normalizeRules({
    enabled: true,
    action: raw.action,
    match: raw.match,
    conditions: raw.conditions,
  })
}

export function resolveFieldName(field, index, slugify) {
  return field.name || slugify(field.label, `field-${index}`)
}

export function getCandidateFields(allFields, currentField, slugify) {
  return (allFields || [])
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => (
      candidate.id !== currentField.id && fieldSupportsRules(candidate.type)
    ))
    .map(({ candidate, index }) => {
      const name = resolveFieldName(candidate, index, slugify)
      const label = candidate.label || name || 'Untitled field'
      return { field: candidate, name, label }
    })
    .filter((entry, index, list) => (
      entry.name && list.findIndex((item) => item.name === entry.name) === index
    ))
}

function operatorNeedsValue(operator) {
  return !VALUE_LESS_OPERATORS.has(operator)
}

function getFieldValue(values, fieldName) {
  const value = values?.[fieldName]
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return String(value[0] ?? '')
  if (typeof value === 'boolean') return value ? 'on' : ''
  return String(value)
}

function evaluateCondition(condition, values) {
  const actual = getFieldValue(values, condition.field)
  const expected = condition.value ?? ''

  switch (condition.operator) {
    case 'equals':
      return actual === expected
    case 'notEquals':
      return actual !== expected
    case 'contains':
      return actual.toLowerCase().includes(String(expected).toLowerCase())
    case 'isEmpty':
      return actual === ''
    case 'isNotEmpty':
      return actual !== ''
    case 'checked':
      return actual === 'on' || actual === 'true' || actual === true
    case 'notChecked':
      return !(actual === 'on' || actual === 'true' || actual === true)
    default:
      return false
  }
}

export function isFieldVisible(field, values, allFields, slugify) {
  const rules = serializeRules(field.rules)
  if (!rules || !rules.conditions.length) return true

  const results = rules.conditions.map((condition) => evaluateCondition(condition, values))
  const matched = rules.match === 'any'
    ? results.some(Boolean)
    : results.every(Boolean)

  return rules.action === 'hide' ? !matched : matched
}

function createConditionRow(field, allFields, condition, { onChange, rerender, slugify }) {
  const row = document.createElement('div')
  row.className = 'rule-row'

  const candidates = getCandidateFields(allFields, field, slugify)
  const sourceSelect = document.createElement('select')
  sourceSelect.className = 'rule-source'
  const emptyOption = document.createElement('option')
  emptyOption.value = ''
  emptyOption.textContent = 'Select field…'
  sourceSelect.appendChild(emptyOption)
  candidates.forEach(({ name, label }) => {
    const opt = document.createElement('option')
    opt.value = name
    opt.textContent = `${label} (${name})`
    if (condition.field === name) opt.selected = true
    sourceSelect.appendChild(opt)
  })
  sourceSelect.addEventListener('change', () => {
    condition.field = sourceSelect.value
    const sourceField = candidates.find((entry) => entry.name === condition.field)?.field
    if (sourceField?.type === 'checkbox') {
      condition.operator = 'checked'
      condition.value = ''
    }
    onChange()
    rerender()
  })

  const operatorSelect = document.createElement('select')
  operatorSelect.className = 'rule-operator'
  const sourceField = candidates.find((entry) => entry.name === condition.field)?.field
  const operators = sourceField?.type === 'checkbox'
    ? RULE_OPERATORS.filter((op) => ['checked', 'notChecked'].includes(op.value))
    : RULE_OPERATORS
  operators.forEach((op) => {
    const opt = document.createElement('option')
    opt.value = op.value
    opt.textContent = op.label
    if (condition.operator === op.value) opt.selected = true
    operatorSelect.appendChild(opt)
  })
  operatorSelect.addEventListener('change', () => {
    condition.operator = operatorSelect.value
    if (!operatorNeedsValue(condition.operator)) condition.value = ''
    onChange()
    rerender()
  })

  row.append(sourceSelect, operatorSelect)

  if (operatorNeedsValue(condition.operator)) {
    const options = (sourceField?.options || [])
      .map((opt) => (typeof opt === 'string' ? opt : opt.label || opt.value || ''))
      .filter(Boolean)

    if (options.length > 0) {
      const valueSelect = document.createElement('select')
      valueSelect.className = 'rule-value'
      const placeholder = document.createElement('option')
      placeholder.value = ''
      placeholder.textContent = 'Select value…'
      valueSelect.appendChild(placeholder)
      options.forEach((opt) => {
        const option = document.createElement('option')
        option.value = opt
        option.textContent = opt
        if (condition.value === opt) option.selected = true
        valueSelect.appendChild(option)
      })
      valueSelect.addEventListener('change', () => {
        condition.value = valueSelect.value
        onChange()
      })
      row.appendChild(valueSelect)
    } else {
      const valueInput = document.createElement('input')
      valueInput.type = 'text'
      valueInput.className = 'rule-value'
      valueInput.placeholder = 'Value'
      valueInput.value = condition.value || ''
      valueInput.addEventListener('input', () => {
        condition.value = valueInput.value
        onChange()
      })
      row.appendChild(valueInput)
    }
  }

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'btn-remove'
  remove.textContent = '✕'
  remove.title = 'Remove condition'
  remove.addEventListener('click', () => {
    field.rules.conditions = field.rules.conditions.filter((item) => item !== condition)
    onChange()
    rerender()
  })
  row.appendChild(remove)

  return row
}

export function createRulesEditor(field, allFields, { onChange, rerender, slugify }) {
  if (!fieldSupportsRules(field.type)) return null

  field.rules = normalizeRules(field.rules)

  const details = document.createElement('details')
  details.className = 'rules-accordion'
  details.open = field.rules.enabled

  const summary = document.createElement('summary')
  summary.textContent = 'Rules (show / hide)'
  details.appendChild(summary)

  const box = document.createElement('div')
  box.className = 'rules-box'

  const enabledLabel = document.createElement('label')
  enabledLabel.className = 'field-required'
  const enabledInput = document.createElement('input')
  enabledInput.type = 'checkbox'
  enabledInput.checked = !!field.rules.enabled
  enabledInput.addEventListener('change', () => {
    field.rules.enabled = enabledInput.checked
    details.open = field.rules.enabled
    onChange()
  })
  const enabledText = document.createElement('span')
  enabledText.textContent = 'Enable visibility rules'
  enabledLabel.append(enabledInput, enabledText)
  box.appendChild(enabledLabel)

  const actionSelect = document.createElement('select')
  RULE_ACTIONS.forEach((action) => {
    const opt = document.createElement('option')
    opt.value = action.value
    opt.textContent = action.label
    if (field.rules.action === action.value) opt.selected = true
    actionSelect.appendChild(opt)
  })
  actionSelect.addEventListener('change', () => {
    field.rules.action = actionSelect.value
    onChange()
  })

  const matchSelect = document.createElement('select')
  RULE_MATCHES.forEach((match) => {
    const opt = document.createElement('option')
    opt.value = match.value
    opt.textContent = match.label
    if (field.rules.match === match.value) opt.selected = true
    matchSelect.appendChild(opt)
  })
  matchSelect.addEventListener('change', () => {
    field.rules.match = matchSelect.value
    onChange()
  })

  const actionWrap = document.createElement('div')
  actionWrap.className = 'labeled'
  const actionLabel = document.createElement('label')
  actionLabel.className = 'form-label'
  actionLabel.textContent = 'Visibility action'
  actionWrap.append(actionLabel, actionSelect)
  box.appendChild(actionWrap)

  const matchWrap = document.createElement('div')
  matchWrap.className = 'labeled'
  const matchLabel = document.createElement('label')
  matchLabel.className = 'form-label'
  matchLabel.textContent = 'Match type'
  matchWrap.append(matchLabel, matchSelect)
  box.appendChild(matchWrap)

  const conditionsLabel = document.createElement('div')
  conditionsLabel.className = 'form-label'
  conditionsLabel.textContent = 'Conditions'
  box.appendChild(conditionsLabel)

  const conditionsBox = document.createElement('div')
  conditionsBox.className = 'rules-conditions'
  field.rules.conditions.forEach((condition) => {
    conditionsBox.appendChild(createConditionRow(field, allFields, condition, {
      onChange,
      rerender,
      slugify,
    }))
  })
  box.appendChild(conditionsBox)

  const addCondition = document.createElement('button')
  addCondition.type = 'button'
  addCondition.className = 'btn-secondary'
  addCondition.textContent = '+ Add condition'
  addCondition.addEventListener('click', () => {
    field.rules.conditions.push({ field: '', operator: 'equals', value: '' })
    field.rules.enabled = true
    enabledInput.checked = true
    details.open = true
    onChange()
    rerender()
  })
  box.appendChild(addCondition)

  const hint = document.createElement('p')
  hint.className = 'field-hint'
  hint.textContent = 'Example: show Company name when Account type equals business.'
  box.appendChild(hint)

  details.appendChild(box)
  return details
}
