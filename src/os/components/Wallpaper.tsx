"use client";

import { motion } from "framer-motion";
import { useOS } from "../store";
import { getWallpaper } from "../wallpapers";

export default function Wallpaper() {
  const wallpaper = useOS((s) => getWallpaper(s.settings.wallpaper));
  return (
    <motion.div
      initial={{ scale: 1.06 }}
      animate={{ scale: 1 }}
      transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-0"
      style={{ background: wallpaper.css }}
      aria-hidden
    />
  );
}
