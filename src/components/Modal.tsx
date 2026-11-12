import { motion, AnimatePresence, PresenceContext } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

/**
 * 通用弹窗。
 * - 遮罩淡入，面板从下方轻微上浮，符合「不是啪一下出来」的要求
 * - ESC 关闭，点击遮罩关闭
 *
 * 性能约定（本机软件渲染下实测过，别回退）：
 * - 遮罩**不能**用 backdrop-filter: blur()。它会让 Chromium 每帧把整个视口的
 *   背景重新做一次高斯模糊，软件渲染下约 70~95ms/帧，打开动画直接掉到 15fps。
 *   改用纯半透明遮罩 + will-change:opacity 走合成层，视觉差别很小但成本归零。
 * - 面板只动 opacity + translateY，不做 scale。scale 会让整个面板（含大阴影、
 *   圆角裁剪和全部表单控件）每帧重新光栅化。
 */
export function Modal({ open, onClose, title, subtitle, children, footer, width = 560 }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-root"
          className="fixed inset-0 z-[150] flex items-center justify-center p-6"
          style={{ pointerEvents: open ? 'auto' : 'none' }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            data-modal-overlay=""
            className="absolute inset-0"
            style={{
              background: 'rgba(16,24,40,0.38)',
              willChange: 'opacity',
            }}
          />
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.14 } }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            data-modal-panel=""
            className="relative flex flex-col max-h-[86vh] rounded-2xl overflow-hidden"
            style={{
              width,
              background: '#ffffff',
              border: '1px solid rgba(16,24,40,0.075)',
              boxShadow: '0 32px 80px -24px rgba(16,24,40,0.28)',
              willChange: 'transform, opacity',
            }}
          >
            <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-[rgba(16,24,40,0.06)]">
              <div>
                <h2 className="text-[15px] font-semibold text-[#12171f]">{title}</h2>
                {subtitle && <p className="text-[11.5px] text-[#8b94a3] mt-1">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 -mr-1 -mt-0.5 rounded-lg text-[#8b94a3] hover:text-[#12171f] hover:bg-[rgba(16,24,40,0.06)] transition-all duration-150"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <PresenceContext.Provider value={null}>{children}</PresenceContext.Provider>
            </div>
            {footer && (
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[rgba(16,24,40,0.06)] bg-[#fafbfc]">
                <PresenceContext.Provider value={null}>{footer}</PresenceContext.Provider>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
