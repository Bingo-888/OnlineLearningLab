export interface TocItem {
  label: string
  onSelect: () => void
}

export function Toc({ items, onClose }: { items: TocItem[]; onClose: () => void }) {
  return (
    <aside data-testid="toc-panel" className="absolute left-0 top-0 z-40 h-full w-72 overflow-y-auto border-r border-gray-200 bg-white p-4 shadow-xl dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">目录</h2>
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">关闭</button>
      </div>
      {items.length === 0 && <p className="text-sm text-gray-400">本书没有可用目录</p>}
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i}>
            <button data-testid="toc-item" onClick={item.onSelect} className="w-full truncate text-left text-sm hover:text-blue-600">
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
