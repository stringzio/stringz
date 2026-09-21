import { motion, AnimatePresence } from "framer-motion";

export interface ToastData {
  id: number;
  text: string;
}

export default function Toast({ toast }: { toast: ToastData | null }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-[70] flex justify-center px-8">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", damping: 24, stiffness: 380 }}
            className="rounded-full bg-[#1a1a1a] px-5 py-2.5 text-[13px] font-medium text-white shadow-xl"
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
