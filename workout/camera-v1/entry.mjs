const params = new URLSearchParams(location.search);
if (params.get('cameraV1') === '1') {
  const target = new URL('./camera-v1/', location.href);
  for (const key of ['ex', 'program']) {
    const value = params.get(key);
    if (value && /^[a-z0-9-]{1,40}$/.test(value)) target.searchParams.set(key, value);
  }
  location.replace(target.href);
} else {
  await import('../js/app.js?v=island-people-scale-20261026-1');
}
