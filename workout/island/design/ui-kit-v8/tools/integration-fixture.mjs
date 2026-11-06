import { readFile } from 'node:fs/promises';

/** Assemble the published HTML examples in memory; never ship generated HTML. */
export async function integrationFixture() {
  const markdown = await readFile(new URL('../INTEGRATION.md', import.meta.url), 'utf8');
  const blocks = language => [...markdown.matchAll(new RegExp('```' + language + '\\n([\\s\\S]*?)```', 'g'))].map(match => match[1]);
  const html = blocks('html');
  const find = marker => {
    const result = html.find(block => block.includes(marker));
    if (!result) throw new Error(`Missing integration example ${marker}`);
    return result;
  };
  const controls = find('iu-stick-zone') + `<div class="iu-controls">${find('data-iu-action="jump"')}</div>`;
  const hud = find('class="iu-hud"');
  const toast = find('id="toast"');
  const dialogs = html.filter(block => /^\s*<dialog/.test(block)).join('\n');
  const messages = find('class="iu-message"');
  const shell = find('<!doctype html>');
  const script = blocks('js').find(block => block.includes('import { mountControls }'));
  if (!script) throw new Error('Missing input integration example');
  const css = blocks('css')[0];
  return shell
    .replace('</body>', `${dialogs}<aside id="integration-messages" hidden>${messages}</aside>
      <script type="module">${script}
      const intro = connectDialog(document.querySelector('#intro'), { controls });
      const result = connectDialog(document.querySelector('#result'), { controls });
      window.integrationExample = { controls, pause, intro, result, dispose };
      </script></body>`)
    .replace(/<!--[\s\S]*?-->/, controls + hud + toast)
    .replace('<body', `<style>${css}</style><body`);
}
