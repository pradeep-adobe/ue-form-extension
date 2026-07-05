import './style.css'
import { register } from '@adobe/uix-guest'
import { loadSpec, renderForm, onSpecChange } from './formSpec.js'

const EXTENSION_ID = 'com.example.ue-hosted-starter'

function renderPageForm(spec) {
  const output = document.getElementById('formOutput')
  if (!output) return
  renderForm(spec, output, {
    onSubmit: (data) => {
      const result = document.getElementById('submitResult')
      if (result) {
        result.hidden = false
        result.textContent = `Submitted: ${JSON.stringify(data)}`
      }
    },
  })
}

async function init() {
  const status = document.getElementById('status')

  renderPageForm(loadSpec())
  onSpecChange(renderPageForm)

  if (status) status.textContent = 'Registering extension…'

  const guestConnection = await register({
    id: EXTENSION_ID,
    methods: {
      rightPanel: {
        addRails() {
          return [
            {
              id: 'form-builder-rail',
              header: 'Form Builder',
              url: '/rail.html',
              icon: 'Form',
            },
          ]
        },
      },
    },
  })

  if (status) status.textContent = 'Extension registered and ready.'
  window.__guestConnection = guestConnection
}

init().catch((error) => {
  console.warn('Registration skipped (standalone mode).', error)
  const status = document.getElementById('status')
  if (status) status.textContent = 'Standalone mode: authored form rendered below.'
})
