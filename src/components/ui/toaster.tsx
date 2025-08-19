"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid">
              {description ? (
                <ToastDescription>{description}</ToastDescription>
              ) : (
                title && <ToastTitle>{title}</ToastTitle>
              )}
            </div>
          </Toast>
        )
      })}
      {/* The pointer-events-none class is added here to allow clicks to pass through the viewport to the map below */}
      <ToastViewport className="pointer-events-none" />
    </ToastProvider>
  )
}
