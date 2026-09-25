import { logger } from '../../../shared/logger.js';

/**
 * Aphura Interactive Presentation Renderer
 * Powered by Reveal.js (MIT). ⭐ 68k+ GitHub Stars
 * https://github.com/hakimel/reveal.js
 * 
 * Renders rich, animated HTML presentations directly inline in the chat.
 * The user sees a fully navigable slide deck — no download required.
 */
export const RevealService = {

  async renderPresentation(slides) {
    logger.info(`[Aphura Reveal.js] 🎬 Rendering ${slides.length}-slide interactive presentation...`);
    try {
      await new Promise(r => setTimeout(r, 800));

      let slidesHTML = '';
      slides.forEach((slide, i) => {
        slidesHTML += `<section>
  <h2>${slide.title}</h2>
  ${slide.subtitle ? `<h4>${slide.subtitle}</h4>` : ''}
  ${slide.bullets ? `<ul>${slide.bullets.map(b => `<li>${b}</li>`).join('')}</ul>` : ''}
  ${slide.note ? `<p><em>${slide.note}</em></p>` : ''}
</section>\n`;
      });

      const fullHTML = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/theme/black.css">
</head>
<body>
  <div class="reveal"><div class="slides">
    ${slidesHTML}
  </div></div>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.js"></script>
  <script>Reveal.initialize({ hash: true, transition: 'slide' });</script>
</body>
</html>`;

      logger.info(`[Aphura Reveal.js] ✅ Presentation rendered.`);
      return { success: true, html: fullHTML, slideCount: slides.length };
    } catch (error) {
      logger.error(`[Aphura Reveal.js] ❌ ${error.message}`);
      throw error;
    }
  }
};
