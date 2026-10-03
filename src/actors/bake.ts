// Merges a rig's untextured child meshes per bone/group into one vertex-coloured
// mesh, cutting a character from ~21 draw calls to ~11 while keeping every
// animated group intact. Colours can still be changed afterwards (outfit
// matched to the featured product) via the returned recolor().

import {
  BufferAttribute,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const VC_MAT = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: DoubleSide })

interface Range {
  mesh: Mesh
  start: number
  count: number
}

export function bakeVertexColors(root: Object3D, skip: (m: Mesh) => boolean): (source: Material, color: Color) => void {
  const ranges = new Map<Material, Range[]>()
  const groups: Object3D[] = []
  root.traverse((o) => {
    if (!(o as Mesh).isMesh) groups.push(o)
  })

  for (const g of groups) {
    const meshes = g.children.filter((c): c is Mesh => {
      const m = c as Mesh
      if (!m.isMesh || skip(m)) return false
      const mat = m.material as MeshStandardMaterial
      return !Array.isArray(mat) && !!mat.isMeshStandardMaterial && !mat.map
    })
    if (meshes.length < 1) continue
    const geos: BufferGeometry[] = []
    const pending: { mat: Material; start: number; count: number }[] = []
    let offset = 0
    for (const m of meshes) {
      m.updateMatrix()
      const geo = m.geometry.clone().applyMatrix4(m.matrix)
      for (const key of Object.keys(geo.attributes)) if (key !== 'position' && key !== 'normal') geo.deleteAttribute(key)
      const n = geo.attributes.position.count
      const col = new Float32Array(n * 3)
      const c = (m.material as MeshStandardMaterial).color
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r
        col[i * 3 + 1] = c.g
        col[i * 3 + 2] = c.b
      }
      geo.setAttribute('color', new Float32BufferAttribute(col, 3))
      geos.push(geo)
      pending.push({ mat: m.material as Material, start: offset, count: n })
      offset += n
    }
    const merged = mergeGeometries(geos, false)
    if (!merged) continue
    const mesh = new Mesh(merged, VC_MAT)
    for (const m of meshes) g.remove(m)
    g.add(mesh)
    for (const p of pending) {
      const list = ranges.get(p.mat) ?? []
      list.push({ mesh, start: p.start, count: p.count })
      ranges.set(p.mat, list)
    }
  }

  return (source, color) => {
    for (const r of ranges.get(source) ?? []) {
      const attr = r.mesh.geometry.getAttribute('color') as BufferAttribute
      for (let i = r.start; i < r.start + r.count; i++) attr.setXYZ(i, color.r, color.g, color.b)
      attr.needsUpdate = true
    }
  }
}
