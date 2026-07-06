import { TFS_FORM_APP } from './config.js'

let appPromise

/** Load the TFS React microfrontend bundle once. */
export function loadFormApp() {
  if (!appPromise) {
    appPromise = new Promise((resolve, reject) => {
      if (window.TFSForm?.render) {
        resolve()
        return
      }
      const script = document.createElement('script')
      script.src = TFS_FORM_APP.scriptUrl
      script.onload = () => {
        if (window.TFSForm?.render) resolve()
        else reject(new Error('TFSForm global not available'))
      }
      script.onerror = () => reject(new Error(`Failed to load ${TFS_FORM_APP.scriptUrl}`))
      document.head.append(script)
    })
  }
  return appPromise
}

export function slugify(value, fallback) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
}

/** Normalize the rail spec into the shape the React microfrontend expects. */
export function toAppSpec(spec) {
  return {
    title: spec.title || '',
    submitLabel: spec.submitLabel || 'Submit',
    fields: (spec.fields || []).map((field, index) => ({
      type: field.type,
      label: field.label,
      name: field.name || slugify(field.label, `field-${index}`),
      placeholder: field.placeholder || '',
      required: !!field.required,
      options: (field.options || []).map((opt) => (
        typeof opt === 'string' ? opt : opt.label || opt.value || ''
      )).filter(Boolean),
    })),
  }
}

/** Render the spec into a host element using the React microfrontend. */
export async function renderFormApp(host, spec) {
  await loadFormApp()
  window.TFSForm.render(host, toAppSpec(spec))
}
