interface Props {
  title: string
  message: string
  dangerous?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ title, message, dangerous, onConfirm, onCancel }: Props) {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className={`btn ${dangerous ? "btn-danger" : "btn-primary"}`} onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
