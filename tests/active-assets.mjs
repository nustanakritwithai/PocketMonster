import fs from 'node:fs';

export const rootUrl = new URL('../', import.meta.url);
export const activeHtmlUrl = new URL('index.html', rootUrl);
export const activeHtml = fs.readFileSync(activeHtmlUrl, 'utf8');

function requiredMatch(pattern, label) {
  const match = activeHtml.match(pattern);
  if (!match) throw new Error(`index.html does not declare an active ${label}`);
  return match[1];
}

function withoutQuery(reference) {
  return reference.split('?', 1)[0].replace(/^\.\//, '');
}

export const activeEntryRef = requiredMatch(/<script\s+type="module"\s+src="([^"]+\.(?:m?js)(?:\?[^"]*)?)"/i, 'module script');
export const activeCssRef = requiredMatch(/<link\s+rel="stylesheet"\s+href="([^"]+\.css(?:\?[^"]*)?)"/i, 'stylesheet');
export const activeEntryName = withoutQuery(activeEntryRef);
export const activeEntryUrl = new URL(activeEntryName, rootUrl);
export const activeEntry = fs.readFileSync(activeEntryUrl, 'utf8');
const gameImport = activeEntry.match(/import\(['"]([^'"]+game-v800\.js(?:\?[^'"]*)?)['"]\)/);
if (!gameImport) throw new Error('active preload does not declare the authenticated game import');
export const activeJsRef = gameImport[1];
export const activeJsName = withoutQuery(activeJsRef);
export const activeCssName = withoutQuery(activeCssRef);
export const activeJsUrl = new URL(activeJsName, rootUrl);
export const activeCssUrl = new URL(activeCssName, rootUrl);
export const activeJs = fs.readFileSync(activeJsUrl, 'utf8');
export const activeCss = fs.readFileSync(activeCssUrl, 'utf8');
