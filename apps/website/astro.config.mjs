import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://cuewise.app',
  output: 'static',
  trailingSlash: 'always',
  // The noindex meta tag does not keep a page out of the sitemap; this filter does.
  integrations: [
    sitemap({ filter: (page) => !page.includes('/uninstall/') && !page.includes('/feedback/') }),
  ],
});
