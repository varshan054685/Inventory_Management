import { toast } from '@/components/ui';

/** Convenience wrapper so pages can call toast.success()/toast.error(). */
export function useToast() {
  return {
    success: (msg: string) => toast(msg, 'success'),
    error: (msg: string) => toast(msg, 'error'),
    info: (msg: string) => toast(msg, 'info'),
  };
}

export { toast };