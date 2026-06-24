import axios from "axios";

const API_URL = import.meta.env.PROD 
  ? 'https://api.ahitchebj.com' // En ligne : ton sous-domaine
  : '';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

export default api;
