import { toast } from "sonner"

export function useToast() {
  return {
    toast,
    dismiss: (toastId?: string | number) => toast.dismiss(toastId),
  }
}
