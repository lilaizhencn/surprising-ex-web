import { Download, Filter, Search } from "lucide-react"
import { Button, Panel, StateView } from "../../components/ui/Primitives"

export function OrdersPage() {
  return (
    <div className="account-content">
      <div className="page-heading">
        <div>
          <h1>Transaction History</h1>
          <p>Orders, fills, funding and transfer records from the account services.</p>
        </div>
        <Button tone="outline" onClick={() => window.alert("导出需要后端分页与导出接口")}>
          <Download size={16} /> Export
        </Button>
      </div>
      <div className="history-toolbar">
        <div className="search-field">
          <Search size={16} />
          <input placeholder="Search symbol or ID" aria-label="Search symbol or ID" />
        </div>
        <Button tone="outline">
          <Filter size={16} /> Filters
        </Button>
      </div>
      <Panel>
        <StateView
          kind="empty"
          message="用户历史查询与导出 Gateway 接口尚未完整确认，页面不会用静态订单冒充真实记录。"
        />
      </Panel>
    </div>
  )
}
