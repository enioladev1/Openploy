"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { HugeiconsIcon } from "@hugeicons/react";
import { Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // resolvedTheme is only known after mount (it depends on the OS preference /
  // localStorage, neither of which the server can see) - rendering the real
  // icon before then would mismatch the server-rendered HTML.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <TooltipTrigger>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={mounted ? (isDark ? "Switch to light mode" : "Switch to dark mode") : "Toggle theme"}
        onPress={() => setTheme(isDark ? "light" : "dark")}
      >
        <HugeiconsIcon icon={isDark ? Moon02Icon : Sun01Icon} size={18} strokeWidth={2} />
      </Button>
      <Tooltip placement="bottom">{mounted ? (isDark ? "Switch to light mode" : "Switch to dark mode") : "Toggle theme"}</Tooltip>
    </TooltipTrigger>
  );
}
