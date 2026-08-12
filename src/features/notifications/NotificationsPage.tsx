import { Bell, Info, Wrench } from "lucide-react"
import { Panel, StateView } from "../../components/ui/Primitives"

export function NotificationsPage() {
  return (
    <div className="container section notifications-page">
      <div className="page-heading">
        <div>
          <h1>Notification Center</h1>
          <p>
            System and account messages will appear here once the user notification API is
            available.
          </p>
        </div>
        <Bell size={28} color="var(--color-primary)" />
      </div>
      <div className="notification-grid">
        <Panel>
          <div className="notification-item">
            <Wrench size={20} />
            <div>
              <h2>Backend capability pending</h2>
              <p>The current backend scan did not expose a user notification list endpoint.</p>
            </div>
          </div>
          <div className="notification-item">
            <Info size={20} />
            <div>
              <h2>No demo messages</h2>
              <p>Static notices are intentionally not presented as production notifications.</p>
            </div>
          </div>
        </Panel>
        <Panel>
          <StateView kind="empty" message="No user notifications returned." />
        </Panel>
      </div>
    </div>
  )
}
