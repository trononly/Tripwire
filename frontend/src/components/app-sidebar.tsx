import * as React from "react"
import { Link, useLocation } from "react-router-dom"
import { LayoutDashboard, ArrowLeftRight, Settings } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const navMain = [
  {
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Transactions", url: "/transactions", icon: ArrowLeftRight },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation()

  return (
    <Sidebar className="border-r border-sidebar-border" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="text-lg font-bold tracking-tight">Mpesa Analyzer</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {navMain.map((group, index) => (
          <SidebarGroup key={group.items[index].title}>

            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                      <Link to={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
