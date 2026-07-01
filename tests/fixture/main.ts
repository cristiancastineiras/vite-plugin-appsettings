/// <reference types="vite/client" />

// Fixture entry — touches two runtime vars and one build-time-only var.
const api = import.meta.env.VITE_API_URL;
const feature = import.meta.env.VITE_FEATURE_FLAG;
const build = import.meta.env.VITE_BUILD_ID;

console.log(api, feature, build);
