// Après le build : écrit le HTML de l'accueil dans dist/index.html (servi sur « / »).
// Les autres pages reçoivent la coquille vide dist/app.html (vercel.json), et les adresses inconnues dist/404.html :
// elles n'affichent jamais le contenu de l'accueil avant leur propre contenu.
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dist = (fichier) => fileURLToPath(new URL(`../dist/${fichier}`, import.meta.url))
const rendu = fileURLToPath(new URL('../dist-prerendu/entry-prerendu.js', import.meta.url))

const coquille = fs.readFileSync(dist('index.html'), 'utf8')
if (!coquille.includes('<div id="app"></div>')) throw new Error('dist/index.html : <div id="app"></div> introuvable (déjà rendu ?)')
fs.writeFileSync(dist('app.html'), coquille)
fs.writeFileSync(dist('404.html'), coquille)

const { rendreAccueil, donneesStructurees } = await import(pathToFileURL(rendu).href)
const html = await rendreAccueil()
if (!html.includes('<h1')) throw new Error("Rendu de l'accueil sans titre h1 : abandon, la coquille reste en place")
const blocs = donneesStructurees()
  .map(({ id, donnees }) => `<script id="${id}" type="application/ld+json">${JSON.stringify(donnees).replace(/</g, '\\u003c')}</script>`)
  .join('\n    ')
const page = coquille
  .replace('<div id="app"></div>', `<div id="app">${html}</div>`)
  .replace('</head>', `    ${blocs}\n  </head>`)
fs.writeFileSync(dist('index.html'), page)
fs.rmSync(fileURLToPath(new URL('../dist-prerendu', import.meta.url)), { recursive: true, force: true })
console.log(`✔ Accueil rendu au build : ${Math.round(html.length / 1024)} Ko de HTML, ${blocs.length ? 'données structurées incluses' : ''}`)
