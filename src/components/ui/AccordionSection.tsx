"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";

interface AccordionSectionProps {
  label: string;
  count: number;
  total: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function AccordionSection({
  label,
  count,
  total,
  defaultOpen = true,
  children,
}: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-2 mb-2"
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: open ? 0 : -90 }}
            transition={{ duration: 0.2 }}
          >
            <PixelIcon name="ChevronDown" size={16} className="text-text-tertiary" />
          </motion.div>
          <h3 className="typo-caption text-text-primary">{label}</h3>
        </div>
        <span className="typo-caption">{count}/{total}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
