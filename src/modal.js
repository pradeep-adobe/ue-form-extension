import './style.css'
import { attach } from '@adobe/uix-guest'
import { EXTENSION_ID } from './extensionId.js'

async function init() {
  const status = document.getElementById('modalStatus')
  if (status) status.textContent = 'Connecting to Universal Editor…'

  const connection = await attach({ id: EXTENSION_ID })

  const closeBtn = document.getElementById('closeBtn')
  if (closeBtn) {
    closeBtn.addEventListener('click', async () => {
      await connection.host.modal.close()
    })
  }

  if (status) status.textContent = 'Connected. This modal can be closed now.'
}

init().catch((error) => {
  console.error(error)
  const status = document.getElementById('modalStatus')
  if (status) status.textContent = `Failed to connect: ${error?.message || error}`
})
