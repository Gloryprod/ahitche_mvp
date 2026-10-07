import './assets/main.css'

import { createApp } from 'vue'
import { vDefilable } from './directives/defilable'
import { vOnglets } from './directives/onglets'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import axios from 'axios';
import Toast from 'vue-toastification'
import 'vue-toastification/dist/index.css'
import { VueQueryPlugin } from '@tanstack/vue-query'


axios.defaults.withCredentials = true;

const app = createApp(App)
app.directive('onglets', vOnglets) // Barres d'onglets : flèches, Début et Fin (accessibilité)
app.directive('defilable', vDefilable) // Zones qui défilent : atteignables au clavier (accessibilité)
app.use(createPinia())  
app.use(router)

app.use(Toast, {
  position: 'top-right',
  timeout: 3000,
  closeOnClick: true
})

app.use(VueQueryPlugin)

app.mount('#app')
