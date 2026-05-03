// Brand palette mirror of frontend/src/app/globals.css.
// Clerk's `variables` API requires literal color strings (CSS var() does not resolve
// reliably across all Clerk components), so the values below must stay in sync
// with --background, --foreground, --primary, --accent, --muted, --border in globals.css.
export const clerkAppearance = {
  variables: {
    colorPrimary: 'oklch(0.685 0.176 247)',
    colorBackground: 'oklch(0.04 0 0)',
    colorText: 'oklch(0.965 0.002 250)',
    colorTextSecondary: 'oklch(0.585 0.012 250)',
    colorInputBackground: 'oklch(0.18 0.006 250)',
    colorInputText: 'oklch(0.965 0.002 250)',
    colorDanger: 'oklch(0.62 0.235 22)',
    colorNeutral: 'oklch(0.965 0.002 250)',
    fontFamily: 'var(--font-geist), system-ui, sans-serif',
    fontFamilyButtons: 'var(--font-geist), system-ui, sans-serif',
    borderRadius: '0.625rem',
  },
  elements: {
    rootBox: 'w-full',
    card: '!bg-popover/60 !backdrop-blur-sm !border !border-border !rounded-2xl !shadow-none !p-6',
    headerTitle: 'hidden',
    headerSubtitle: 'hidden',
    socialButtonsBlockButton:
      '!h-10 !rounded-full !border !border-border !bg-transparent !text-foreground hover:!bg-accent hover:!border-border !shadow-none !transition-colors focus:!ring-0 focus-visible:!ring-2 focus-visible:!ring-primary/20',
    socialButtonsBlockButtonText: '!text-foreground !text-[14px] !font-semibold',
    dividerLine: '!bg-border',
    dividerText: '!text-muted-foreground !text-[10px] !uppercase !tracking-[0.2em] !font-mono',
    formFieldLabel: '!text-muted-foreground !text-[11px] !uppercase !tracking-wide !font-mono !mb-1.5',
    formFieldInput:
      '!h-10 !rounded-xl !border !border-border !bg-input !px-3.5 !text-[14px] !text-foreground placeholder:!text-muted-foreground/60 focus:!border-primary/60 focus:!ring-2 focus:!ring-primary/20 !transition-colors',
    formFieldInputShowPasswordButton: '!text-muted-foreground hover:!text-foreground !transition-colors',
    formButtonPrimary:
      '!h-10 !bg-foreground !text-background hover:!opacity-90 !rounded-full !font-bold !normal-case !shadow-none !text-[15px] !tracking-tight !transition-opacity',
    footer: '!bg-transparent',
    footerAction: '!text-muted-foreground !text-[13px]',
    footerActionText: '!text-muted-foreground',
    footerActionLink: '!text-primary hover:!underline !font-medium',
    identityPreviewText: '!text-foreground !text-[14px]',
    identityPreviewEditButton: '!text-primary hover:!underline',
    formFieldErrorText: '!text-destructive !text-[12px] !mt-1.5',
    alert: '!bg-destructive/10 !border !border-destructive/40 !text-destructive !rounded-xl',
    formFieldSuccessText: '!text-foreground !text-[12px]',
    otpCodeFieldInput:
      '!h-12 !w-10 !rounded-xl !border !border-border !bg-input !text-foreground !text-[18px] focus:!border-primary/60 focus:!ring-2 focus:!ring-primary/20',
    formResendCodeLink: '!text-primary hover:!underline !text-[13px]',
    badge: '!bg-accent !text-foreground !border !border-border !rounded-md',
    // UserButton popover (sidebar avatar dropdown)
    userButtonAvatarBox: '!h-7 !w-7',
    userButtonPopoverCard:
      '!bg-popover !border !border-border !rounded-2xl !shadow-2xl !shadow-black/40',
    userButtonPopoverMain: '!bg-transparent',
    userButtonPopoverActions: '!bg-transparent',
    userButtonPopoverActionButton:
      '!text-foreground hover:!bg-accent !rounded-md !transition-colors',
    userButtonPopoverActionButtonText: '!text-foreground !text-[14px]',
    userButtonPopoverActionButtonIcon: '!text-muted-foreground',
    userButtonPopoverFooter: '!hidden',
    userPreview: '!bg-transparent',
    userPreviewMainIdentifier: '!text-foreground !text-[14px] !font-semibold',
    userPreviewSecondaryIdentifier: '!text-muted-foreground !text-[12px]',
    userPreviewTextContainer: '!text-foreground',
    userButtonOuterIdentifier: '!text-foreground',
    avatarBox: '!ring-2 !ring-border',
  },
  layout: {
    socialButtonsPlacement: 'top' as const,
    socialButtonsVariant: 'blockButton' as const,
    showOptionalFields: false,
  },
};
