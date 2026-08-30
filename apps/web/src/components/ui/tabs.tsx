"use client"

import {
  Tab,
  TabList,
  TabPanel,
  Tabs as TabsPrimitive,
  type TabListProps,
  type TabPanelProps,
  type TabProps,
  type TabsProps,
} from "react-aria-components"

import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: TabsProps) {
  return <TabsPrimitive data-slot="tabs" className={cn("flex flex-col gap-6", className)} {...props} />
}

function TabsList<T extends object>({ className, ...props }: TabListProps<T>) {
  return (
    <TabList
      data-slot="tabs-list"
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1 self-center overflow-x-auto rounded-full border border-border bg-muted p-1",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabProps) {
  return (
    <Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative flex h-8 shrink-0 cursor-pointer items-center rounded-full px-4 text-sm font-medium text-muted-foreground outline-none transition-colors select-none hover:text-foreground data-[selected]:bg-background data-[selected]:text-foreground data-[selected]:shadow-sm data-[focus-visible]:ring-3 data-[focus-visible]:ring-ring/30 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabPanelProps) {
  return <TabPanel data-slot="tabs-content" className={cn("flex flex-col gap-6 outline-none", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
