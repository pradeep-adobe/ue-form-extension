import './style.css'
import { register } from '@adobe/uix-guest'
import metadata from './app-metadata.json'
import { loadSpec, onSpecChange } from './formSpec.js'
import { renderFormApp } from './formAppLoader.js'
import { EXTENSION_ID } from './extensionId.js'

async function renderPageForm(spec) {
  const output = document.getElementById('formOutput')
  if (!output) return
  try {
    await renderFormApp(output, spec)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Could not render form microfrontend', error)
    output.innerHTML = '<p class="status">Unable to load the form app. Start tfs-form-app (<code>npm run dev</code>) and trust its certificate.</p>'
  }
}

async function init() {
  const status = document.getElementById('status')

  renderPageForm(loadSpec())
  onSpecChange(renderPageForm)

  if (status) status.textContent = 'Registering extension…'

  const guestConnection = await register({
    id: EXTENSION_ID,
    metadata,
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
