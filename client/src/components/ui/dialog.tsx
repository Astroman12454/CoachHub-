"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const { t } = useTranslation()
  return (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Below sm: a bottom sheet — anchored to the bottom edge, full
        // width, rounded top only, slides up. A dialog stacked in the
        // middle of a small screen (thumb reaching up to it, content
        // clipped top and bottom) is the single most "not a real app"
        // detail on mobile; a sheet is where a thumb already is.
        // max-w-lg here (unprefixed, not sm:) so a consumer's own max-w-*
        // override — several dialogs need max-w-2xl/3xl/4xl for embedded
        // lists — wins via the same last-class-in-cn precedence it always
        // did, at every breakpoint, not just mobile.
        // grid-cols-[minmax(0,1fr)]: this element has no explicit
        // grid-template-columns, so its one implicit column defaults to
        // `auto` sizing — which, unlike a `1fr`/`minmax(0,...)` track, is
        // based on the *max-content* width of whatever's inside, ignoring
        // how wide the dialog itself actually is. A long DialogDescription
        // would rather overflow the dialog on one unbroken line than wrap
        // (confirmed: a 342px-wide dialog rendering a 485px-wide paragraph;
        // min-w-0 on the description/header alone didn't fix it — the grid
        // track itself needed constraining, not just the items in it). Every
        // dialog in the app shares this component, so this was invisible
        // until a description finally ran long enough to need it.
        "fixed inset-x-0 bottom-0 top-auto z-50 grid grid-cols-[minmax(0,1fr)] max-h-[85vh] w-full max-w-lg translate-x-0 translate-y-0 gap-4 overflow-y-auto rounded-t-xl border-t bg-background p-6 pt-5 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        // sm and up: the original centered modal, unchanged.
        "sm:inset-x-auto sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:pt-6 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%] sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-bottom-0",
        className
      )}
      {...props}
    >
      <div className="mx-auto -mt-1 mb-1 h-1.5 w-10 flex-shrink-0 rounded-full bg-muted-foreground/25 sm:hidden" aria-hidden="true" />
      {children}
      <DialogPrimitive.Close className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">{t("common.close")}</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
