import { Sidebar } from "@/components/Sidebar"
import styles from "./layout.module.css"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={styles.appContainer}>
      <Sidebar />
      <main className={styles.mainContent}>
        <div className={styles.pageWrapper}>
          {children}
        </div>
      </main>
    </div>
  )
}
