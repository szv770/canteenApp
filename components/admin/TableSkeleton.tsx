interface Props {
  cols: number
  rows?: number
}

export default function TableSkeleton({ cols, rows = 6 }: Props) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-gray-100">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-5 py-3.5">
              <div
                className="h-4 bg-gray-100 rounded animate-pulse"
                style={{ width: `${60 + ((i * 7 + j * 13) % 30)}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
