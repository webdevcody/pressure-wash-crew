import * as THREE from 'three'

/**
 * Window grid for a box's side faces. `bay` and `floor` are the target cell
 * size in meters (rounded so every face holds whole cells); `w`/`h` are the
 * window's share of a cell (0..1).
 */
export interface WindowStyle {
  bay: number
  floor: number
  w: number
  h: number
}

const tmpColor = new THREE.Color()

/**
 * Accumulates flat-shaded, non-indexed triangles for the whole city into one
 * BufferGeometry so the backdrop is a single draw call. Each vertex carries a
 * color (sRGB hex converted to linear), a window-cell UV and `aWin`
 * (window width, window height, per-building seed; width 0 = no windows).
 */
export class CityBuilder {
  private pos: number[] = []
  private nrm: number[] = []
  private uv: number[] = []
  private col: number[] = []
  private win: number[] = []

  private pushTri(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    color: THREE.Color,
    uvs?: [number, number, number, number, number, number],
    win?: [number, number, number],
  ) {
    const n = new THREE.Vector3().subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize()
    for (const v of [a, b, c]) {
      this.pos.push(v.x, v.y, v.z)
      this.nrm.push(n.x, n.y, n.z)
      this.col.push(color.r, color.g, color.b)
    }
    if (uvs) this.uv.push(...uvs)
    else this.uv.push(0, 0, 0, 0, 0, 0)
    const w = win ?? [0, 0, 0]
    for (let i = 0; i < 3; i++) this.win.push(w[0], w[1], w[2])
  }

  /** Quad a-b-c-d, counter-clockwise when seen from the front. */
  private pushQuad(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    color: THREE.Color,
    uv?: [number, number, number, number, number, number, number, number],
    win?: [number, number, number],
  ) {
    if (uv) {
      this.pushTri(a, b, c, color, [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]], win)
      this.pushTri(a, c, d, color, [uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]], win)
    } else {
      this.pushTri(a, b, c, color, undefined, win)
      this.pushTri(a, c, d, color, undefined, win)
    }
  }

  /**
   * Axis-aligned box (before `rotY`) standing on `y0`, centered on (cx, cz).
   * Side faces get window cells when `style` is given; the bottom is skipped.
   */
  box(
    cx: number,
    y0: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    color: string,
    rotY = 0,
    style?: WindowStyle,
    seed = 0,
  ) {
    const c = tmpColor.set(color).clone()
    const cos = Math.cos(rotY)
    const sin = Math.sin(rotY)
    const P = (x: number, y: number, z: number) =>
      new THREE.Vector3(cx + x * cos + z * sin, y0 + y, cz - x * sin + z * cos)
    const hx = w / 2
    const hz = d / 2
    // Corners: bottom (y=0) and top (y=h)
    const b0 = P(-hx, 0, hz), b1 = P(hx, 0, hz), b2 = P(hx, 0, -hz), b3 = P(-hx, 0, -hz)
    const t0 = P(-hx, h, hz), t1 = P(hx, h, hz), t2 = P(hx, h, -hz), t3 = P(-hx, h, -hz)

    const side = (a: THREE.Vector3, b: THREE.Vector3, tb: THREE.Vector3, ta: THREE.Vector3, width: number) => {
      if (!style) return this.pushQuad(a, b, tb, ta, c)
      const cu = Math.max(1, Math.round(width / style.bay))
      const cv = Math.max(1, Math.round(h / style.floor))
      this.pushQuad(a, b, tb, ta, c, [0, 0, cu, 0, cu, cv, 0, cv], [style.w, style.h, seed])
    }
    side(b0, b1, t1, t0, w) // +z
    side(b1, b2, t2, t1, d) // +x
    side(b2, b3, t3, t2, w) // -z
    side(b3, b0, t0, t3, d) // -x
    this.pushQuad(t0, t1, t2, t3, c) // top
  }

  /**
   * Gable roof sitting on `y0`: ridge runs along local x (length `w`),
   * slopes fall toward ±z (depth `d`). Gable ends use `wallColor`.
   */
  gable(cx: number, y0: number, cz: number, w: number, d: number, h: number, color: string, wallColor: string, rotY = 0) {
    const c = tmpColor.set(color).clone()
    const wc = tmpColor.set(wallColor).clone()
    const cos = Math.cos(rotY)
    const sin = Math.sin(rotY)
    const P = (x: number, y: number, z: number) =>
      new THREE.Vector3(cx + x * cos + z * sin, y0 + y, cz - x * sin + z * cos)
    const hx = w / 2
    const hz = d / 2
    const e0 = P(-hx, 0, hz), e1 = P(hx, 0, hz), e2 = P(hx, 0, -hz), e3 = P(-hx, 0, -hz)
    const r0 = P(-hx, h, 0), r1 = P(hx, h, 0)
    this.pushQuad(e0, e1, r1, r0, c) // front slope
    this.pushQuad(e2, e3, r0, r1, c) // back slope
    this.pushTri(e1, e2, r1, wc) // +x gable
    this.pushTri(e3, e0, r0, wc) // -x gable
  }

  /** Adds a template mesh's triangles, transformed by `m`, in one color. */
  mesh(template: THREE.BufferGeometry, m: THREE.Matrix4, color: string) {
    const c = tmpColor.set(color).clone()
    const g = template.index ? template.toNonIndexed() : template
    const p = g.getAttribute('position')
    const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3()
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i).applyMatrix4(m)
      b.fromBufferAttribute(p, i + 1).applyMatrix4(m)
      d.fromBufferAttribute(p, i + 2).applyMatrix4(m)
      this.pushTri(a.clone(), b.clone(), d.clone(), c)
    }
    if (g !== template) g.dispose()
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('aWin', new THREE.Float32BufferAttribute(this.win, 3))
    g.computeBoundingSphere()
    return g
  }
}
