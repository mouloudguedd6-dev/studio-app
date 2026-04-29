"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { Library, Mic2, Search, Settings, Calendar, LogOut, Disc, BookmarkCheck } from "lucide-react"
import styles from "./sidebar.module.css"

export function Sidebar() {
  const pathname = usePathname()

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: Disc },
    { name: "Bibliothèque Audio", href: "/audio", icon: Mic2 },
    { name: "Textes & Thèmes", href: "/texts", icon: Library },
    { name: "Punchlines", href: "/favorites", icon: BookmarkCheck },
    { name: "Recherche", href: "/search", icon: Search },
    { name: "Studio Sessions", href: "/studio", icon: Calendar },
    { name: "Profil DA", href: "/profile", icon: Settings },
  ]

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <div className={styles.logoIcon}></div>
        <span>Studio App</span>
      </div>

      <nav className={styles.nav}>
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`${styles.navItem} ${isActive ? styles.active : ""}`}
            >
              <item.icon size={20} />
              <span>{item.name}</span>
            </Link>
          )
        })}
      </nav>

      <div className={styles.footer}>
        <button className={styles.logoutBtn} onClick={() => signOut()}>
          <LogOut size={20} />
          <span>Déconnexion</span>
        </button>
      </div>
    </aside>
  )
}
