// Vérifie le câblage Azure / DeepL avec un fetch simulé : aucun appel réseau,
// aucune clé réelle. `node scripts/translate-smoke.mjs` sort en code 1 au premier écart.
import assert from 'node:assert/strict'
import { translateText, translateBatch } from './translate.mjs'

// Isole le test des clés posées dans l'environnement du développeur.
delete process.env.DEEPL_API_KEY
delete process.env.AZURE_TRANSLATOR_KEY
delete process.env.AZURE_TRANSLATOR_REGION

const seen = []
const json = (status, payload) => async (url, init) => {
  seen.push({ url, init, body: init.body ? JSON.parse(init.body) : null })
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}
const GOOGLE_OK = '[[["Bonjour le monde",null,null,null]]]'
const deeplOk = (text) => ({ translations: [{ detected_source_language: 'EN', text }] })
const azureOk = (text) => [{ detectedLanguage: { language: 'en', score: 1 }, translations: [{ text, to: 'fr' }] }]

// 1. Azure en tête de chaîne : URL, en-têtes, corps, et langue source.
seen.length = 0
const az = await translateText('Hello world', {
  from: 'en', to: 'fr', azureKey: 'az-key', azureRegion: 'westeurope',
  fetchImpl: json(200, azureOk('Bonjour le monde')),
})
assert.equal(az, 'Bonjour le monde')
assert.match(seen[0].url, /^https:\/\/api\.cognitive\.microsofttranslator\.com\/translate\?/)
assert.match(seen[0].url, /api-version=3\.0/)
assert.match(seen[0].url, /to=fr/)
assert.match(seen[0].url, /from=en/)
assert.equal(seen[0].init.method, 'POST')
assert.equal(seen[0].init.headers['Ocp-Apim-Subscription-Key'], 'az-key')
assert.equal(seen[0].init.headers['Ocp-Apim-Subscription-Region'], 'westeurope')
assert.deepEqual(seen[0].body, [{ Text: 'Hello world' }])

// 2. `zh` doit devenir `zh-Hans`, sinon Azure rejette les 39 articles chinois.
seen.length = 0
await translateText('你好', { from: 'zh', to: 'fr', azureKey: 'az-key', fetchImpl: json(200, azureOk('Bonjour')) })
assert.match(seen[0].url, /from=zh-Hans/)

// 3. Région absente : en-tête omis, requête toujours valide.
seen.length = 0
await translateText('Hello', { from: 'en', to: 'fr', azureKey: 'az-key', fetchImpl: json(200, azureOk('Bonjour')) })
assert.equal(seen[0].init.headers['Ocp-Apim-Subscription-Region'], undefined)

// 4. Quota Azure épuisé (403) → repli Google, jamais d'article perdu.
seen.length = 0
const azQuota = await translateText('Hello world', {
  from: 'en', to: 'fr', azureKey: 'az-key', deeplKey: '',
  fetchImpl: async (url, init) => (url.includes('microsofttranslator.com')
    ? json(403, { error: { code: 403001, message: 'Quota exceeded' } })(url, init)
    : json(200, JSON.parse(GOOGLE_OK))(url, init)),
})
assert.equal(azQuota, 'Bonjour le monde')
assert.equal(seen.length, 2)
assert.match(seen[1].url, /translate\.googleapis\.com/)

// 5. Priorité : Azure l'emporte sur DeepL quand les deux sont configurés.
seen.length = 0
await translateText('Hello', {
  from: 'en', to: 'fr', azureKey: 'az-key', deeplKey: 'k:fx',
  fetchImpl: json(200, azureOk('Bonjour')),
})
assert.equal(seen.length, 1)
assert.match(seen[0].url, /microsofttranslator\.com/)

// 6. DeepL free (`:fx`) → hôte free, auth, source_lang et cible en capitales.
seen.length = 0
const one = await translateText('Hello world', {
  from: 'en', to: 'fr', deeplKey: 'k:fx', azureKey: '', fetchImpl: json(200, deeplOk('Bonjour le monde')),
})
assert.equal(one, 'Bonjour le monde')
assert.equal(seen[0].url, 'https://api-free.deepl.com/v2/translate')
assert.equal(seen[0].init.headers.authorization, 'DeepL-Auth-Key k:fx')
assert.deepEqual(seen[0].body, { text: ['Hello world'], target_lang: 'FR', source_lang: 'EN' })

// 7. DeepL pro → hôte pro.
seen.length = 0
await translateText('Hello', { from: 'en', to: 'fr', deeplKey: 'abc', azureKey: '', fetchImpl: json(200, deeplOk('Bonjour')) })
assert.equal(seen[0].url, 'https://api.deepl.com/v2/translate')

// 8. Langue source non gérée par DeepL → source_lang omis (détection automatique).
seen.length = 0
await translateText('Hello', { from: 'hi', to: 'fr', deeplKey: 'k:fx', azureKey: '', fetchImpl: json(200, deeplOk('Bonjour')) })
assert.equal(seen[0].body.source_lang, undefined)
assert.equal(seen[0].body.target_lang, 'FR')

// 9. Quota DeepL (456) → repli Google.
seen.length = 0
const dQuota = await translateText('Hello world', {
  from: 'en', to: 'fr', deeplKey: 'k:fx', azureKey: '',
  fetchImpl: async (url, init) => (url.startsWith('https://api-free.deepl.com')
    ? json(456, { message: 'Quota exceeded' })(url, init)
    : json(200, JSON.parse(GOOGLE_OK))(url, init)),
})
assert.equal(dQuota, 'Bonjour le monde')
assert.match(seen[1].url, /translate\.googleapis\.com/)

// 10. Aucune clé → Google directement.
seen.length = 0
await translateText('Hello', { from: 'en', to: 'fr', deeplKey: '', azureKey: '', fetchImpl: json(200, JSON.parse(GOOGLE_OK)) })
assert.equal(seen.length, 1)
assert.match(seen[0].url, /translate\.googleapis\.com/)

// 11. Le lot publie bien les articles traduits par Azure (translated: true).
seen.length = 0
const batch = await translateBatch(
  [{ id: '0', title: 'Hello', description: 'World news', lang: 'en' }],
  { to: 'fr', azureKey: 'az-key', deeplKey: '', fetchImpl: json(200, azureOk('Bonjour')) },
)
assert.equal(batch[0].translated, true)
assert.equal(batch[0].engine, 'azure')
assert.equal(batch[0].title, 'Bonjour')
assert.equal(batch[0].originalTitle, 'Hello')

// 12. Une source française ne déclenche aucun appel.
seen.length = 0
const fr = await translateBatch(
  [{ id: '0', title: 'Bonjour', description: 'Monde', lang: 'fr' }],
  { to: 'fr', azureKey: 'az-key', fetchImpl: json(200, azureOk('x')) },
)
assert.equal(seen.length, 0)
assert.equal(fr[0].translated, false)
assert.equal(fr[0].engine, 'passthrough')

console.log('✓ translate-smoke : 12/12 (azure, zh-Hans, sans région, quota 403, priorité, deepl free/pro, source non gérée, quota 456, sans clé, lot, source fr)')
