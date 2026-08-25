/**
 * Shared "which overlay is topmost" stack for Drawer/ConfirmDialog (F12 AC-05.5, AC-06.2):
 * with a confirm-dialog nested inside a drawer, Esc must close only the topmost surface.
 * Module-scoped array (not React state) — purely an ordering primitive, no re-renders needed.
 */
let stack: symbol[] = [];

export function pushTopmost(id: symbol): void {
  stack = [...stack, id];
}

export function popTopmost(id: symbol): void {
  stack = stack.filter((s) => s !== id);
}

export function isTopmost(id: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id;
}
