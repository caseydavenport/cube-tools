// A cube is read-only when it's a dynamically-loaded CubeCobra cube (cc:
// prefix). These have no writable backend, so the UI hides write controls.
export function isReadOnly(cube) {
  return typeof cube === "string" && cube.startsWith("cc:");
}
