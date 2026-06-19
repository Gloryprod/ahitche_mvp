import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import axios from 'axios';
import Toast from 'vue-toastification'
import 'vue-toastification/dist/index.css'
import VueTelInput from 'vue-tel-input';
import 'vue-tel-input/vue-tel-input.css';

axios.defaults.withCredentials = true;

const app = createApp(App)
app.use(VueTelInput)
app.use(createPinia())  
app.use(router)

app.use(Toast, {
  position: 'top-right',
  timeout: 3000,
  closeOnClick: true
})

app.mount('#app')
