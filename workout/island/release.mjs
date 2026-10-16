/** Bump for every release containing code or bundled data changes. */
export const DATA_VERSION='g4b-20261017-1';
export function dataURL(path,base=new URL('./',import.meta.url)) {
  const url=new URL(path,base);url.searchParams.set('v',DATA_VERSION);return url;
}
