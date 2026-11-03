'use client'

import { Component, Suspense, useMemo, type ReactNode } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

class AssetErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.warn('[MPD Studio] 외부 GLB 모델을 불러오지 못해 기본 모델로 전환합니다:', error.message)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function LoadedGLB({ url, scale = 1 }: { url: string; scale?: number | [number, number, number] }) {
  const { scene } = useGLTF(url)
  const clone = useMemo(() => {
    const copy = scene.clone(true)
    copy.traverse((object: THREE.Object3D) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true
        object.receiveShadow = true
        object.frustumCulled = true
      }
    })
    return copy
  }, [scene])

  return <primitive object={clone} scale={scale} dispose={null} />
}

/** Loads a CC0 GLB from the 3D Assets CDN, with a local procedural fallback. */
export function GLBAsset({
  url,
  scale = 1,
  fallback = null,
}: {
  url: string
  scale?: number | [number, number, number]
  fallback?: ReactNode
}) {
  return (
    <AssetErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <LoadedGLB url={url} scale={scale} />
      </Suspense>
    </AssetErrorBoundary>
  )
}
