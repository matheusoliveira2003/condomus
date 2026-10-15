// O google-services.json não é versionado (contém a chave de API do Firebase).
// Nos builds do EAS ele vem da variável secreta GOOGLE_SERVICES_JSON (tipo arquivo);
// localmente, usa o arquivo em apps/mobile/google-services.json.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
  },
});
