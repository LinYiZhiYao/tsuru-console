import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useApp } from '@/stores/app';

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warn: AlertTriangle,
};

const COLORS = {
  success: { fg: '#0f9d70', bg: 'rgba(15,157,112,0.1)', border: 'rgba(34,201,139,0.28)' },
  error: { fg: '#dc2f4b', bg: 'rgba(244,63,94,0.1)', border: 'rgba(244,63,94,0.3)' },
  info: { fg: '#0891a8', bg: 'rgba(18,184,204,0.1)', border: 'rgba(18,184,204,0.28)' },
  warn: { fg: '#b45309', bg: 'rgba(245,158,11,0.1)', border: 'rgba(217,119,6,0.24)' },
};

/**
 * 右下角 Toast 堆栈。
 * 入场：从右侧滑入 + 淡入；退场：向右滑出 + 收缩高度，避免下方元素「跳」一下。
 */
export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);

  return (
    <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 items-end pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => {
          const Icon = ICONS[t.type];
          const c = COLORS[t.type];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96, transition: { duration: 0.16 } }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl max-w-[360px] min-w-[240px]"
              style={{
                background: 'rgba(255,255,255,0.96)',
                border: `1px solid ${c.border}`,
                boxShadow: '0 14px 34px -12px rgba(16,24,40,0.20), 0 1px 2px rgba(16,24,40,0.05)',
              }}
            >
              <Icon size={15} style={{ color: c.fg, marginTop: 1, flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium text-[#12171f] leading-tight">{t.title}</div>
                {t.desc && (
                  <div className="text-[11.5px] text-[#5b6473] mt-1 leading-relaxed break-words">
                    {t.desc}
                  </div>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-[#8b94a3] hover:text-[#12171f] transition-colors duration-150 shrink-0"
              >
                <X size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
