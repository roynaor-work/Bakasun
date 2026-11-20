/** Each presentation change can be compared independently. The master switch wins. */
export function readHoopsPolish(search = globalThis.location?.search || '') {
  const params = new URLSearchParams(search);
  const enabled = params.get('hoopsPolish') !== '0';
  const on = feature => enabled && params.get('hoopsPolish' + feature) !== '0';
  return {
    physics: on('Physics'),
    rim: on('Rim'),
    net: on('Net'),
    audio: on('Audio'),
    lighting: on('Lighting'),
    shadow: on('Shadow'),
    transitions: on('Transitions'),
  };
}
