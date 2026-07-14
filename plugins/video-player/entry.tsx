import "./style.css"
import Component from "./player-modal.tsx"
import { createRoot } from "react-dom/client"
customElements.define("player-modal", class extends HTMLElement {
  root = null
  _item = null
  _manifests = null
  connectedCallback() {
    try { this.root = createRoot(this); this._render() }
    catch (e) { this.innerHTML = `<p style="color:red">WC error: ${e}</p>` }
  }
  disconnectedCallback() { this.root?.unmount(); this.root = null }
  set item(d) { this._item = d; this._render() }
  set manifests(d) { this._manifests = d; this._render() }
  _render() {
    if (!this.root) return
    this.root.render(<Component item={this._item} manifests={this._manifests} />)
  }
})