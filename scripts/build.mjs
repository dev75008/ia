// Build local du site. Équivalent à `vite build`, mais sans passer par le
// chargement du fichier de configuration par le CLI : dans certains
// environnements confinés (Windows), ce chargement appelle `net use` via
// child_process et échoue en EPERM. La configuration reste celle de
// vite.config.js, importée directement.
import config from '../vite.config.js'
import { build } from 'vite'

await build({ ...config, configFile: false })
