export default function Legend() {
  return (
    <div className="legend">
      <div className="legend-item">
        <div className="legend-color inactive"></div>
        <span>Free</span>
      </div>
      <div className="legend-item">
        <div className="legend-color active"></div>
        <span>Occupied</span>
      </div>
      <div className="legend-item">
        <div className="legend-color defect"></div>
        <span>Defect</span>
      </div>
      <div className="legend-item">
        <div className="legend-color selected"></div>
        <span>Selected</span>
      </div>
      <div className="legend-item">
        <div className="legend-color dimmed"></div>
        <span>Not matching current search/filter</span>
      </div>
    </div>
  )
}
