/**
 * True when a pointer event landed on the toast layer.
 *
 * Modals treat every pointerdown outside their content as "dismiss", but the
 * toaster is deliberately stacked above them so a toast can be tapped or
 * swiped while a dialog is open. Those interactions belong to the toast, not
 * to the modal underneath, so the modal's outside-press handler must ignore
 * them.
 */
export function isToastPointer(target: EventTarget | null | undefined): boolean {
	return (
		typeof Element !== "undefined" &&
		target instanceof Element &&
		Boolean(target.closest("[data-sonner-toaster]"))
	);
}
