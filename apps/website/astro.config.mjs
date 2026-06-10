import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://cuewise.app',
  output: 'static',
  integrations: [sitemap()],
});
