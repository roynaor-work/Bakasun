/** Bump for every release containing code or bundled data changes. */
export const DATA_VERSION='island-art-20261022-3';
export function dataURL(path,base=new URL('./',import.meta.url)) {
  const url=new URL(path,base);url.searchParams.set('v',DATA_VERSION);return url;
}
