export default function Legend() {
  return (
    <div className="legend">
      <div className="legend-item">
        <div className="legend-color inactive"></div>
        <span>Free ramp</span>
      </div>
      <div className="legend-item">
        <div className="legend-color active"></div>
        <span>Occupied / truck assigned</span>
      </div>
      <div className="legend-item">
        <div className="legend-color defect"></div>
        <span>Defect / blocked</span>
      </div>
      <div className="legend-item">
        <div className="legend-color selected"></div>
        <span>Selected ramp</span>
      </div>
    </div>
  )
}
