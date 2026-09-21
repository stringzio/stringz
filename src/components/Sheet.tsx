import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function Sheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="absolute inset-0 z-50 bg-black/25"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            // Dismiss on pointerdown, not click: a node tap opens the sheet on
            // pointerup, and on touch the trailing compatibility click retargets
            // to this freshly-rendered backdrop and would self-close it. The
            // opening gesture never fires pointerdown here (the backdrop didn't
            // exist at press time), so this closes only on a real, separate tap.
            onPointerDown={onClose}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 z-50 rounded-t-[2rem] bg-white px-5 pb-9 pt-3 shadow-[0_-12px_36px_-16px_rgba(0,0,0,0.2)] max-h-[78%] overflow-y-auto no-scrollbar"
            initial={{ y: "105%" }}
            animate={{ y: 0 }}
            exit={{ y: "105%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            <div className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-gray-200" />
            {title && <h3 className="mb-3 text-lg font-bold text-[#1a1a1a]">{title}</h3>}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
