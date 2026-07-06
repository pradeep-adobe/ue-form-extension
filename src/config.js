// Central configuration for the TFS form microfrontend integration.
// Keep this in sync with poc-tfs-form/blocks/form/form-config.js.
// Change these URLs when deploying to a real environment.
export const TFS_FORM_APP = {
  // URL of the built React microfrontend bundle (tfs-form-app), served over
  // HTTPS so this HTTPS extension page can load it without mixed content.
  scriptUrl: 'https://localhost:3001/tfs-form.iife.js',
}
