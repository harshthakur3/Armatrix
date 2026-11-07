// Static markup, hoisted so every render reuses the same elements.
const PINS = (
  <>
    <span className="pin pin-tl" aria-hidden="true" />
    <span className="pin pin-tr" aria-hidden="true" />
    <span className="pin pin-bl" aria-hidden="true" />
    <span className="pin pin-br" aria-hidden="true" />
  </>
)

export default function Pins() {
  return PINS
}
