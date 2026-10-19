const KEY = "se.sidebarCollapsed"

// readCollapsed returns the viewer's saved sidebar state, or expanded when
// nothing is saved or storage is blocked.
export function readCollapsed() {
  try {
    return localStorage.getItem(KEY) === "true"
  } catch {
    return false
  }
}

// writeCollapsed saves the sidebar state. Blocked storage just means the
// choice isn't remembered.
export function writeCollapsed(value) {
  try {
    localStorage.setItem(KEY, String(value))
  } catch {
    // Nothing to do; the in-memory state still applies.
  }
}
