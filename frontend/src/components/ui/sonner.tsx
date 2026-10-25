import { useTheme } from "next-themes"
import { Toaster as Sonner, toast, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  // Tapping a toast dismisses it. Radix locks body pointer events while a
  // modal is open, and the toast lives above that lock, so tapping is far
  // easier than trying to swipe inside the modal's gesture area. Action and
  // close buttons keep their own click behaviour.
  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (
      target.closest(
        "button, a, input, textarea, select, [data-button], [data-close-button]",
      )
    ) {
      return
    }
    const element = target.closest<HTMLElement>("[data-sonner-toast]")
    if (!element) return

    const index = Number(element.dataset.index)
    const id = Number.isInteger(index) ? toast.getToasts()[index]?.id : undefined
    if (id !== undefined) toast.dismiss(id)
    else toast.dismiss()
  }

  return (
    <div onClick={handleClick}>
      <Sonner
        theme={theme as ToasterProps["theme"]}
        className="toaster group"
        icons={{
          success: (
            <CircleCheckIcon className="size-4" />
          ),
          info: (
            <InfoIcon className="size-4" />
          ),
          warning: (
            <TriangleAlertIcon className="size-4" />
          ),
          error: (
            <OctagonXIcon className="size-4" />
          ),
          loading: (
            <Loader2Icon className="size-4 animate-spin" />
          ),
        }}
        style={
          {
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
            "--border-radius": "var(--radius)",
            // Above dialogs (z-50) and drawers (z-90), including their
            // overlays, so a toast is always readable and tappable.
            zIndex: 2_147_483_647,
          } as React.CSSProperties
        }
        offset={{ bottom: "1.5rem" }}
        mobileOffset={{
          bottom:
            "calc(5.5rem + var(--safe-bottom, env(safe-area-inset-bottom)))",
        }}
        toastOptions={{
          classNames: {
            toast: "cn-toast pointer-events-auto cursor-pointer",
          },
        }}
        {...props}
      />
    </div>
  )
}

export { Toaster }
